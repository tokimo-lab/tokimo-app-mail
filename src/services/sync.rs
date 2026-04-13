use chrono::Utc;
use sea_orm::*;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::db::entities::{mail_accounts, mail_folders};
use crate::error::AppError;

use super::super::repos;
use super::accounts::account_to_config;

/// Full sync of an account — sync folders, then messages for each folder.
pub async fn sync_account(
    db: &DatabaseConnection,
    user_id: Uuid,
    account_id: Uuid,
) -> Result<(), AppError> {
    let account = repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Account not found".into()))?;

    info!("Starting mail sync for account: {} ({})", account.email, account.id);

    let cfg = account_to_config(&account);
    let client = tokimo_mail::MailClient::new(cfg.clone());

    // 1. Sync folders first.
    let remote_folders = client
        .list_folders_with_counts()
        .await
        .map_err(|e| AppError::Internal(format!("IMAP list folders: {e}")))?;

    let mut db_folders = Vec::new();
    for rf in &remote_folders {
        let folder_type = detect_folder_type(&rf.name, &rf.attributes);
        let sort_order = folder_sort_order(&folder_type);
        let model = repos::folders::upsert(
            db,
            account_id,
            &rf.name,
            rf.delimiter.as_deref(),
            &folder_type,
            &rf.attributes,
            rf.total.unwrap_or(0) as i32,
            rf.unseen.unwrap_or(0) as i32,
            sort_order,
        )
        .await?;
        db_folders.push(model);
    }

    // 2. Sync messages for each folder.
    for folder in &db_folders {
        if let Err(e) = sync_folder_messages(db, &cfg, account_id, folder).await {
            warn!(
                "Failed to sync folder '{}' for {}: {e}",
                folder.name, account.email
            );
        }
    }

    // 3. Update last_sync_at.
    let mut active: mail_accounts::ActiveModel = account.into();
    active.last_sync_at = Set(Some(Utc::now().fixed_offset()));
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(db).await?;

    info!("Mail sync completed for account_id={account_id}");
    Ok(())
}

/// Sync messages for a single folder.
async fn sync_folder_messages(
    db: &DatabaseConnection,
    cfg: &tokimo_mail::MailAccountConfig,
    account_id: Uuid,
    folder: &mail_folders::Model,
) -> Result<(), AppError> {
    let client = tokimo_mail::MailClient::new(cfg.clone());

    // Fetch up to 200 most recent messages (paginated sync if needed later).
    let (summaries, total) = client
        .fetch_messages(&folder.name, 1, 200)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP fetch: {e}")))?;

    debug!(
        "Folder '{}': {} messages on server, fetched {} summaries",
        folder.name,
        total,
        summaries.len()
    );

    for summary in &summaries {
        // Check if message already exists by (account_id, folder_id, uid).
        let exists = repos::messages::exists_by_uid(db, account_id, folder.id, summary.uid as i32)
            .await?;
        if exists {
            continue;
        }

        // Fetch full message from IMAP.
        let full = match client.fetch_message(&folder.name, summary.uid).await {
            Ok(msg) => msg,
            Err(e) => {
                warn!("Failed to fetch message uid={}: {e}", summary.uid);
                continue;
            }
        };

        // Generate preview from text body.
        let preview = full
            .text_body
            .as_ref()
            .or(full.html_body.as_ref())
            .map(|t| t.chars().take(200).collect::<String>())
            .unwrap_or_default();

        let is_read = full.flags.iter().any(|f| f == "\\Seen");
        let is_flagged = full.flags.iter().any(|f| f == "\\Flagged");

        let from_json = serde_json::to_value(&full.from).unwrap_or_default();
        let to_json = serde_json::to_value(&full.to).unwrap_or_default();
        let cc_json = serde_json::to_value(&full.cc).unwrap_or_default();
        let bcc_json = serde_json::to_value(&full.bcc).unwrap_or_default();
        let reply_to_json = serde_json::to_value(&full.reply_to).unwrap_or_default();
        let flags_json = serde_json::to_value(&full.flags).unwrap_or_default();
        let refs_str = if full.references.is_empty() {
            None
        } else {
            Some(full.references.join(" "))
        };

        let msg_model = repos::messages::create(
            db,
            account_id,
            folder.id,
            summary.uid as i32,
            full.message_id,
            &full.subject,
            from_json,
            to_json,
            Some(cc_json),
            Some(bcc_json),
            Some(reply_to_json),
            full.in_reply_to,
            refs_str,
            full.date,
            full.text_body.as_deref(),
            full.html_body.as_deref(),
            &preview,
            flags_json,
            is_read,
            is_flagged,
            !full.attachments.is_empty(),
            full.size as i32,
        )
        .await?;

        // Save attachments.
        for att in &full.attachments {
            repos::messages::create_attachment(
                db,
                msg_model.id,
                &att.filename,
                &att.content_type,
                att.size as i32,
                att.data.as_deref(),
            )
            .await?;
        }
    }

    // Update folder counts.
    let mut active: mail_folders::ActiveModel = folder.clone().into();
    active.total_count = Set(total as i32);
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(db).await?;

    Ok(())
}

fn detect_folder_type(name: &str, attributes: &[String]) -> String {
    let lower = name.to_lowercase();
    let attr_str = attributes.join(" ").to_lowercase();

    if attr_str.contains("\\inbox") || lower == "inbox" {
        return "inbox".into();
    }
    if attr_str.contains("\\sent") || lower.contains("sent") {
        return "sent".into();
    }
    if attr_str.contains("\\drafts") || lower.contains("draft") {
        return "drafts".into();
    }
    if attr_str.contains("\\trash") || lower.contains("trash") || lower.contains("deleted") {
        return "trash".into();
    }
    if attr_str.contains("\\junk") || lower.contains("junk") || lower.contains("spam") {
        return "junk".into();
    }
    if attr_str.contains("\\archive") || lower.contains("archive") || lower.contains("all mail") {
        return "archive".into();
    }
    "custom".into()
}

fn folder_sort_order(folder_type: &str) -> i32 {
    match folder_type {
        "inbox" => 0,
        "drafts" => 1,
        "sent" => 2,
        "archive" => 3,
        "junk" => 4,
        "trash" => 5,
        _ => 10,
    }
}
