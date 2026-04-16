use sea_orm::*;
use uuid::Uuid;

use crate::db::entities::mail_folders;
use crate::error::AppError;

use super::super::handlers::folders::MailFolderOutput;
use super::super::repos;
use super::accounts::account_to_config;

/// List cached folders from database.
pub async fn list_folders(
    db: &DatabaseConnection,
    user_id: Uuid,
    account_id: Uuid,
) -> Result<Vec<MailFolderOutput>, AppError> {
    // Verify ownership.
    repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Account not found".into()))?;

    let folders = repos::folders::list_by_account(db, account_id).await?;
    Ok(folders.into_iter().map(model_to_output).collect())
}

/// Sync folders from IMAP server and persist to database.
pub async fn sync_folders(
    db: &DatabaseConnection,
    user_id: Uuid,
    account_id: Uuid,
) -> Result<Vec<MailFolderOutput>, AppError> {
    let account = repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Account not found".into()))?;

    let cfg = account_to_config(&account);
    let client = tokimo_mail::MailClient::new(cfg);
    let remote_folders = client
        .list_folders_with_counts()
        .await
        .map_err(|e| AppError::Internal(format!("IMAP list folders: {e}")))?;

    // Upsert folders into DB.
    let mut result = Vec::new();
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
        result.push(model_to_output(model));
    }

    // Remove folders that no longer exist on server.
    let remote_names: Vec<&str> = remote_folders.iter().map(|f| f.name.as_str()).collect();
    repos::folders::delete_absent(db, account_id, &remote_names).await?;

    result.sort_by_key(|f| f.sort_order);
    Ok(result)
}

fn model_to_output(m: mail_folders::Model) -> MailFolderOutput {
    let decoded = tokimo_mail::decode_mailbox_name(&m.name);
    // Strip provider prefixes like "[Gmail]/" for display.
    let display = match m.delimiter.as_deref() {
        Some(d) => decoded.rsplit_once(d).map_or(decoded.as_str(), |(_, b)| b),
        None => decoded.rsplit_once('/').map_or(decoded.as_str(), |(_, b)| b),
    };
    MailFolderOutput {
        id: m.id.to_string(),
        account_id: m.account_id.to_string(),
        name: display.to_string(),
        delimiter: m.delimiter,
        folder_type: m.folder_type,
        total_count: m.total_count,
        unread_count: m.unread_count,
        sort_order: m.sort_order,
    }
}

/// Detect folder type from IMAP name and attributes.
fn detect_folder_type(raw_name: &str, attributes: &[String]) -> String {
    let decoded = tokimo_mail::decode_mailbox_name(raw_name);
    // Strip common prefixes like "[Gmail]/" for keyword matching.
    let base = decoded.rsplit_once('/').map_or(decoded.as_str(), |(_, b)| b);
    let lower = base.to_lowercase();
    let attr_str = attributes.join(" ").to_lowercase();

    // Check IMAP special-use attributes first.
    if attr_str.contains("\\inbox") || lower == "inbox" {
        return "inbox".into();
    }
    if attr_str.contains("\\sent") || lower.contains("sent") || base.contains("已发送") || base.contains("送信済み")
    {
        return "sent".into();
    }
    if attr_str.contains("\\drafts") || lower.contains("draft") || base.contains("草稿") || base.contains("下書き")
    {
        return "drafts".into();
    }
    if attr_str.contains("\\trash")
        || lower.contains("trash")
        || lower.contains("deleted")
        || base.contains("废纸篓")
        || base.contains("已删除")
        || base.contains("ゴミ箱")
    {
        return "trash".into();
    }
    if attr_str.contains("\\junk")
        || lower.contains("junk")
        || lower.contains("spam")
        || base.contains("垃圾")
        || base.contains("迷惑メール")
    {
        return "junk".into();
    }
    if attr_str.contains("\\all")
        || attr_str.contains("\\archive")
        || lower.contains("archive")
        || lower.contains("all mail")
        || base.contains("所有邮件")
        || base.contains("すべてのメール")
    {
        return "archive".into();
    }
    if attr_str.contains("\\flagged")
        || lower.contains("starred")
        || lower.contains("flagged")
        || base.contains("已加星标")
        || base.contains("星标")
        || base.contains("スター付き")
    {
        return "starred".into();
    }
    if attr_str.contains("\\important") || lower.contains("important") || base.contains("重要") {
        return "important".into();
    }
    "custom".into()
}

/// Sort order for folder types (lower = higher in list).
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
