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
///
/// Two-phase approach:
///   1. **Forward sync** — fetch messages with UID > max stored UID (new mail).
///   2. **History backfill** — progressively crawl backwards from the lowest
///      known UID, one batch per sync tick, until we reach UID 1.
///      Progress is stored in `mail_folders.history_sync_cursor`.
async fn sync_folder_messages(
    db: &DatabaseConnection,
    cfg: &tokimo_mail::MailAccountConfig,
    account_id: Uuid,
    folder: &mail_folders::Model,
) -> Result<(), AppError> {
    let client = tokimo_mail::MailClient::new(cfg.clone());

    // ── Phase 1: Forward sync (new mail) ─────────────────────────────────
    let max_uid = repos::messages::max_uid_in_folder(db, account_id, folder.id).await?;

    let total = if let Some(max_uid) = max_uid {
        let (summaries, total) = client
            .fetch_new_messages_since(&folder.name, max_uid as u32)
            .await
            .map_err(|e| AppError::Internal(format!("IMAP incremental fetch: {e}")))?;

        debug!(
            "Folder '{}': {} on server, {} new (UID > {})",
            folder.name,
            total,
            summaries.len(),
            max_uid
        );

        sync_message_batch(db, &client, account_id, folder, &summaries).await?;
        total
    } else {
        // Very first sync — grab the last 200 by sequence number to give the
        // user something to look at immediately.
        let (summaries, total) = client
            .fetch_messages(&folder.name, 1, 200)
            .await
            .map_err(|e| AppError::Internal(format!("IMAP first fetch: {e}")))?;

        debug!(
            "Folder '{}': first sync, {} on server, fetched {}",
            folder.name,
            total,
            summaries.len()
        );

        sync_message_batch(db, &client, account_id, folder, &summaries).await?;
        total
    };

    // ── Phase 2: Progressive history backfill ────────────────────────────
    // cursor == None  → not started — initialize from the min UID we have
    // cursor == Some(0) → complete — skip
    // cursor == Some(n) → resume from UID n, crawl downward
    let cursor = folder.history_sync_cursor;
    if cursor != Some(0)
        && let Err(e) = backfill_history(db, &client, account_id, folder, cursor).await
    {
        warn!("History backfill failed for folder '{}': {e}", folder.name);
    }

    // ── Update folder counts ─────────────────────────────────────────────
    let mut active: mail_folders::ActiveModel = folder.clone().into();
    active.total_count = Set(total as i32);
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(db).await?;

    Ok(())
}

/// Fetch and store a batch of message summaries.
///
/// Uses batch IMAP fetch (one connection per sub-batch of 50) instead of
/// opening a separate connection for every single message.
const FETCH_SUB_BATCH: usize = 50;

async fn sync_message_batch(
    db: &DatabaseConnection,
    client: &tokimo_mail::MailClient,
    account_id: Uuid,
    folder: &mail_folders::Model,
    summaries: &[tokimo_mail::MailMessageSummary],
) -> Result<(), AppError> {
    // 1. Filter to UIDs not yet in DB.
    let mut missing_uids: Vec<u32> = Vec::new();
    for summary in summaries {
        let exists = repos::messages::exists_by_uid(db, account_id, folder.id, summary.uid as i32)
            .await?;
        if !exists {
            missing_uids.push(summary.uid);
        }
    }

    if missing_uids.is_empty() {
        return Ok(());
    }

    debug!(
        "Folder '{}': fetching {} new messages in batches",
        folder.name,
        missing_uids.len()
    );

    // 2. Batch-fetch full messages (one IMAP session per sub-batch).
    for chunk in missing_uids.chunks(FETCH_SUB_BATCH) {
        let uid_set = chunk
            .iter()
            .map(std::string::ToString::to_string)
            .collect::<Vec<_>>()
            .join(",");

        let messages = match client.fetch_messages_batch(&folder.name, &uid_set).await {
            Ok(msgs) => msgs,
            Err(e) => {
                warn!(
                    "Failed to batch-fetch {} messages in '{}': {e}",
                    chunk.len(),
                    folder.name
                );
                continue;
            }
        };

        for full in &messages {
            store_full_message(db, account_id, folder, full).await?;
        }
    }
    Ok(())
}

/// Persist a single fully-fetched message to the database.
async fn store_full_message(
    db: &DatabaseConnection,
    account_id: Uuid,
    folder: &mail_folders::Model,
    full: &tokimo_mail::MailMessage,
) -> Result<(), AppError> {
    // Generate preview: prefer plain text, fall back to HTML with tags stripped.
    let preview = full
        .text_body
        .as_ref()
        .map(|t| t.chars().take(200).collect::<String>())
        .or_else(|| {
            full.html_body
                .as_ref()
                .map(|html| strip_html_for_preview(html, 200))
        })
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
        full.uid as i32,
        full.message_id.clone(),
        &full.subject,
        from_json,
        to_json,
        Some(cc_json),
        Some(bcc_json),
        Some(reply_to_json),
        full.in_reply_to.clone(),
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
    Ok(())
}

/// Progressive history backfill — crawl backwards one batch per sync tick.
///
/// Uses `mail_folders.history_sync_cursor` to track progress:
/// - `None` → first run: initialize cursor from the lowest UID in DB
/// - `Some(n)` where n > 1 → fetch UIDs below `n`, update cursor
/// - `Some(0)` → complete (caller should skip)
///
/// Each tick fetches up to `HISTORY_BATCH_RANGE` UIDs going backwards.
/// IMAP UIDs can have gaps, so the actual message count per batch varies.
const HISTORY_BATCH_RANGE: u32 = 500;

async fn backfill_history(
    db: &DatabaseConnection,
    client: &tokimo_mail::MailClient,
    account_id: Uuid,
    folder: &mail_folders::Model,
    cursor: Option<i32>,
) -> Result<(), AppError> {
    // Determine starting cursor.
    let cursor_uid = match cursor {
        Some(c) if c > 0 => c as u32,
        None => {
            // First time: start from the lowest UID we already have.
            let min_uid =
                repos::messages::min_uid_in_folder(db, account_id, folder.id).await?;
            match min_uid {
                Some(uid) if uid > 1 => uid as u32,
                _ => {
                    // No messages or already at UID 1 — nothing to backfill.
                    update_history_cursor(db, folder, 0).await?;
                    return Ok(());
                }
            }
        }
        _ => return Ok(()), // cursor == Some(0): already complete
    };

    if cursor_uid <= 1 {
        update_history_cursor(db, folder, 0).await?;
        return Ok(());
    }

    // Calculate UID range to fetch: [low, cursor_uid - 1]
    let low = Ord::max(cursor_uid.saturating_sub(HISTORY_BATCH_RANGE), 1);
    let high = cursor_uid - 1;
    let uid_range = format!("{low}:{high}");

    debug!(
        "Folder '{}': history backfill UID range {uid_range}",
        folder.name,
    );

    let summaries = client
        .fetch_summaries_by_uids(&folder.name, &uid_range)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP history backfill: {e}")))?;

    if !summaries.is_empty() {
        info!(
            "Folder '{}': backfilling {} messages (UID {}..{})",
            folder.name,
            summaries.len(),
            low,
            high
        );
        sync_message_batch(db, client, account_id, folder, &summaries).await?;
    }

    // Update cursor.
    let new_cursor = if low <= 1 { 0 } else { low as i32 };
    update_history_cursor(db, folder, new_cursor).await?;

    if new_cursor == 0 {
        info!("Folder '{}': history sync complete", folder.name);
    }

    Ok(())
}

/// Persist the history sync cursor to the database.
async fn update_history_cursor(
    db: &DatabaseConnection,
    folder: &mail_folders::Model,
    cursor: i32,
) -> Result<(), AppError> {
    let mut active: mail_folders::ActiveModel = folder.clone().into();
    active.history_sync_cursor = Set(Some(cursor));
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(db).await.map_err(AppError::Database)?;
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

/// Strip HTML tags and collapse whitespace for a plain-text preview.
fn strip_html_for_preview(html: &str, max_chars: usize) -> String {
    let mut out = String::with_capacity(max_chars);
    let mut inside_tag = false;
    let mut last_was_space = true;

    for ch in html.chars() {
        if out.len() >= max_chars {
            break;
        }
        match ch {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => {
                if ch.is_whitespace() {
                    if !last_was_space {
                        out.push(' ');
                        last_was_space = true;
                    }
                } else {
                    out.push(ch);
                    last_was_space = false;
                }
            }
            _ => {}
        }
    }
    out.trim().to_string()
}

