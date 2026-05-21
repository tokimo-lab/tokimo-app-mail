use sea_orm::*;
use uuid::Uuid;

use crate::db::entities::mail_folders;
use crate::error::AppError;

use super::accounts::account_to_config;
use crate::handlers::folders::MailFolderOutput;
use crate::repos;

pub async fn list_folders(
    db: &DatabaseConnection,
    user_id: Uuid,
    account_id: Uuid,
) -> Result<Vec<MailFolderOutput>, AppError> {
    repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Account not found".into()))?;

    let folders = repos::folders::list_by_account(db, account_id).await?;
    Ok(folders.into_iter().map(model_to_output).collect())
}

pub async fn sync_folders(
    db: &DatabaseConnection,
    user_id: Uuid,
    account_id: Uuid,
) -> Result<Vec<MailFolderOutput>, AppError> {
    let account = repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Account not found".into()))?;

    let cfg = account_to_config(&account);
    let client = tokimo_package_mail::MailClient::new(cfg);
    let remote_folders = client
        .list_folders_with_counts()
        .await
        .map_err(|e| AppError::Internal(format!("IMAP list folders: {e}")))?;

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

    let remote_names: Vec<&str> = remote_folders.iter().map(|f| f.name.as_str()).collect();
    repos::folders::delete_absent(db, account_id, &remote_names).await?;

    result.sort_by_key(|f| f.sort_order);
    Ok(result)
}

pub fn display_folder_name(raw_name: &str, delimiter: Option<&str>) -> String {
    let decoded = tokimo_package_mail::decode_mailbox_name(raw_name);
    let display = match delimiter {
        Some(d) => decoded.rsplit_once(d).map_or(decoded.as_str(), |(_, b)| b),
        None => decoded.rsplit_once('/').map_or(decoded.as_str(), |(_, b)| b),
    };
    display.to_string()
}

fn model_to_output(m: mail_folders::Model) -> MailFolderOutput {
    let name = display_folder_name(&m.name, m.delimiter.as_deref());
    MailFolderOutput {
        id: m.id.to_string(),
        account_id: m.account_id.to_string(),
        name,
        delimiter: m.delimiter,
        folder_type: m.folder_type,
        total_count: m.total_count,
        unread_count: m.unread_count,
        sort_order: m.sort_order,
    }
}

fn detect_folder_type(raw_name: &str, attributes: &[String]) -> String {
    let decoded = tokimo_package_mail::decode_mailbox_name(raw_name);
    let base = decoded.rsplit_once('/').map_or(decoded.as_str(), |(_, b)| b);
    let lower = base.to_lowercase();
    let attr_str = attributes.join(" ").to_lowercase();

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
