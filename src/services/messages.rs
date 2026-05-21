use sea_orm::*;
use uuid::Uuid;

use crate::error::AppError;

use super::accounts::account_to_config;
use crate::handlers::messages::{
    MailAddressOutput, MailAttachmentOutput, MailMessageFullOutput, MailMessageListOutput, MailMessageSummaryOutput,
    SendMessageBody,
};
use crate::repos;

pub async fn list_messages(
    db: &DatabaseConnection,
    user_id: Uuid,
    account_id: Uuid,
    folder_id: Uuid,
    page: u32,
    page_size: u32,
) -> Result<MailMessageListOutput, AppError> {
    repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Account not found".into()))?;

    let (messages, total) = repos::messages::list_by_folder(db, folder_id, page, page_size).await?;

    let output: Vec<MailMessageSummaryOutput> = messages
        .into_iter()
        .map(|m| {
            let from = parse_addrs(&m.from_addrs);
            let to = parse_addrs(&m.to_addrs);
            MailMessageSummaryOutput {
                id: m.id.to_string(),
                uid: m.uid,
                message_id: m.message_id,
                subject: m.subject,
                from,
                to,
                date: m.date.map(|d| d.to_rfc3339()),
                is_read: m.is_read,
                is_flagged: m.is_flagged,
                has_attachments: m.has_attachments,
                preview: m.preview,
                size: m.size,
                folder_id: m.folder_id.to_string(),
            }
        })
        .collect();

    Ok(MailMessageListOutput {
        messages: output,
        total,
    })
}

pub async fn get_message(
    db: &DatabaseConnection,
    user_id: Uuid,
    message_id: i32,
) -> Result<MailMessageFullOutput, AppError> {
    let msg = repos::messages::find_by_id(db, message_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Message not found".into()))?;

    let account = repos::accounts::find_by_id_and_user(db, msg.account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Message not found".into()))?;

    let msg = if msg.body_fetched {
        msg
    } else {
        let cfg = account_to_config(&account);
        let folder = repos::folders::find_by_id(db, msg.folder_id).await?;
        if let Some(ref folder) = folder {
            match fetch_message_body_now(db, &cfg, &folder.name, message_id, msg.uid as u32).await {
                Ok(()) => repos::messages::find_by_id(db, message_id)
                    .await?
                    .ok_or_else(|| AppError::NotFound("Message not found".into()))?,
                Err(e) => {
                    tracing::warn!("On-demand body fetch failed for {message_id}: {e}");
                    msg
                }
            }
        } else {
            msg
        }
    };

    if !msg.is_read {
        repos::messages::update_read_status(db, &[message_id], true).await?;
        refresh_folder_unread_count(db, msg.folder_id).await?;

        let folder = repos::folders::find_by_id(db, msg.folder_id).await?;
        if let Some(folder) = folder {
            let cfg = account_to_config(&account);
            let uid = msg.uid as u32;
            tokio::spawn(async move {
                let client = tokimo_package_mail::MailClient::new(cfg);
                if let Err(e) = client.mark_read(&folder.name, &[uid]).await {
                    tracing::warn!("Failed to mark UID {uid} as seen on IMAP: {e}");
                }
            });
        }
    }

    let attachments = repos::messages::list_attachments(db, message_id).await?;

    let from = parse_addrs(&msg.from_addrs);
    let to = parse_addrs(&msg.to_addrs);
    let cc = msg.cc_addrs.as_ref().map(parse_addrs).unwrap_or_default();
    let bcc = msg.bcc_addrs.as_ref().map(parse_addrs).unwrap_or_default();
    let reply_to = msg.reply_to_addrs.as_ref().map(parse_addrs).unwrap_or_default();
    let refs: Vec<String> = msg
        .refs
        .as_ref()
        .map(|r| r.split_whitespace().map(String::from).collect())
        .unwrap_or_default();

    Ok(MailMessageFullOutput {
        id: msg.id.to_string(),
        uid: msg.uid,
        message_id: msg.message_id,
        subject: msg.subject,
        from,
        to,
        cc,
        bcc,
        reply_to,
        date: msg.date.map(|d| d.to_rfc3339()),
        is_read: true,
        is_flagged: msg.is_flagged,
        in_reply_to: msg.in_reply_to,
        references: refs,
        text_body: msg.text_body,
        html_body: msg.html_body,
        attachments: attachments
            .into_iter()
            .map(|a| MailAttachmentOutput {
                id: a.id.to_string(),
                filename: a.filename,
                content_type: a.content_type,
                size: a.size,
                data: a.data,
            })
            .collect(),
        size: msg.size,
        folder_id: msg.folder_id.to_string(),
        account_id: msg.account_id.to_string(),
    })
}

pub async fn mark_read(db: &DatabaseConnection, user_id: Uuid, message_ids: &[String]) -> Result<(), AppError> {
    let ids = parse_ids(message_ids)?;
    repos::messages::update_read_status(db, &ids, true).await?;
    refresh_folder_unread_counts_for_messages(db, &ids).await?;
    spawn_imap_flag_update(db, user_id, &ids, true).await;
    Ok(())
}

pub async fn mark_unread(db: &DatabaseConnection, user_id: Uuid, message_ids: &[String]) -> Result<(), AppError> {
    let ids = parse_ids(message_ids)?;
    repos::messages::update_read_status(db, &ids, false).await?;
    refresh_folder_unread_counts_for_messages(db, &ids).await?;
    spawn_imap_flag_update(db, user_id, &ids, false).await;
    Ok(())
}

pub async fn delete_messages(db: &DatabaseConnection, _user_id: Uuid, message_ids: &[String]) -> Result<(), AppError> {
    let ids = parse_ids(message_ids)?;
    repos::messages::delete_many(db, &ids).await
}

pub async fn refetch_body(
    db: &DatabaseConnection,
    user_id: Uuid,
    message_id: i32,
) -> Result<MailMessageFullOutput, AppError> {
    repos::messages::reset_body_fetched(db, message_id).await?;
    get_message(db, user_id, message_id).await
}

pub async fn move_messages(
    db: &DatabaseConnection,
    _user_id: Uuid,
    message_ids: &[String],
    target_folder_id: &str,
) -> Result<(), AppError> {
    let ids = parse_ids(message_ids)?;
    let fid: Uuid = target_folder_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid folder id".into()))?;
    repos::messages::move_to_folder(db, &ids, fid).await
}

pub async fn send_message(
    db: &DatabaseConnection,
    user_id: Uuid,
    account_id: Uuid,
    body: SendMessageBody,
    attachments: Vec<tokimo_package_mail::message::ComposeAttachment>,
) -> Result<(), AppError> {
    let account = repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Account not found".into()))?;

    let cfg = account_to_config(&account);
    let client = tokimo_package_mail::MailClient::new(cfg);

    let compose = tokimo_package_mail::message::ComposeMessage {
        to: body.to,
        cc: body.cc.unwrap_or_default(),
        bcc: body.bcc.unwrap_or_default(),
        subject: body.subject,
        text_body: body.text_body,
        html_body: body.html_body,
        in_reply_to: body.in_reply_to,
        references: body.references.unwrap_or_default(),
        attachments,
    };

    client
        .send_message(&compose)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to send email: {e}")))?;

    Ok(())
}

pub async fn search_messages(
    db: &DatabaseConnection,
    user_id: Uuid,
    account_id: Uuid,
    query: &str,
) -> Result<MailMessageListOutput, AppError> {
    repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Account not found".into()))?;

    let messages = repos::messages::search(db, account_id, query).await?;
    let total = messages.len() as i64;
    Ok(MailMessageListOutput {
        messages: messages
            .into_iter()
            .map(|m| {
                let from = parse_addrs(&m.from_addrs);
                let to = parse_addrs(&m.to_addrs);
                MailMessageSummaryOutput {
                    id: m.id.to_string(),
                    uid: m.uid,
                    message_id: m.message_id,
                    subject: m.subject,
                    from,
                    to,
                    date: m.date.map(|d| d.to_rfc3339()),
                    is_read: m.is_read,
                    is_flagged: m.is_flagged,
                    has_attachments: m.has_attachments,
                    preview: m.preview,
                    size: m.size,
                    folder_id: m.folder_id.to_string(),
                }
            })
            .collect(),
        total,
    })
}

async fn fetch_message_body_now(
    db: &DatabaseConnection,
    cfg: &tokimo_package_mail::MailAccountConfig,
    folder_name: &str,
    message_id: i32,
    uid: u32,
) -> Result<(), AppError> {
    let mut session = tokimo_package_mail::MailSession::connect(cfg)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP connect for on-demand fetch: {e}")))?;

    session
        .open_folder(folder_name)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP SELECT '{folder_name}': {e}")))?;

    let messages = session
        .fetch_messages_batch(&uid.to_string())
        .await
        .map_err(|e| AppError::Internal(format!("IMAP FETCH UID {uid}: {e}")))?;

    session.logout().await;

    let Some(full_msg) = messages.into_iter().find(|m| m.uid == uid) else {
        tracing::warn!("UID {uid} not found on IMAP server during on-demand fetch");
        return Ok(());
    };

    let text_body = full_msg.text_body.as_deref().map(strip_null_bytes);
    let html_body = full_msg.html_body.as_deref().map(strip_null_bytes);

    let preview = text_body
        .as_deref()
        .unwrap_or_default()
        .chars()
        .take(200)
        .collect::<String>();

    let cc_json = serde_json::to_value(&full_msg.cc).ok();
    let bcc_json = serde_json::to_value(&full_msg.bcc).ok();
    let reply_to_json = serde_json::to_value(&full_msg.reply_to).ok();
    let refs = if full_msg.references.is_empty() {
        None
    } else {
        Some(full_msg.references.join(" "))
    };

    repos::messages::update_body(
        db,
        message_id,
        text_body.as_deref(),
        html_body.as_deref(),
        &preview,
        cc_json,
        bcc_json,
        reply_to_json,
        full_msg.in_reply_to,
        refs,
    )
    .await?;

    for attachment in &full_msg.attachments {
        repos::messages::create_attachment(
            db,
            message_id,
            &attachment.filename,
            &attachment.content_type,
            attachment.size as i32,
            attachment.data.as_deref(),
        )
        .await?;
    }

    Ok(())
}

async fn refresh_folder_unread_count(db: &DatabaseConnection, folder_id: Uuid) -> Result<(), AppError> {
    let count = repos::messages::count_unread(db, folder_id).await?;
    repos::folders::update_unread_count(db, folder_id, count as i32).await
}

async fn refresh_folder_unread_counts_for_messages(
    db: &DatabaseConnection,
    message_ids: &[i32],
) -> Result<(), AppError> {
    let mut folder_ids = std::collections::HashSet::new();
    for &id in message_ids {
        if let Some(msg) = repos::messages::find_by_id(db, id).await? {
            folder_ids.insert(msg.folder_id);
        }
    }
    for fid in folder_ids {
        refresh_folder_unread_count(db, fid).await?;
    }
    Ok(())
}

async fn spawn_imap_flag_update(db: &DatabaseConnection, user_id: Uuid, message_ids: &[i32], mark_read: bool) {
    let mut by_folder: std::collections::HashMap<(Uuid, Uuid), Vec<u32>> = std::collections::HashMap::new();
    for &msg_id in message_ids {
        if let Ok(Some(msg)) = repos::messages::find_by_id(db, msg_id).await {
            by_folder
                .entry((msg.account_id, msg.folder_id))
                .or_default()
                .push(msg.uid as u32);
        }
    }

    for ((account_id, folder_id), uids) in by_folder {
        let Ok(Some(account)) = repos::accounts::find_by_id_and_user(db, account_id, user_id).await else {
            continue;
        };
        let Ok(Some(folder)) = repos::folders::find_by_id(db, folder_id).await else {
            continue;
        };
        let cfg = account_to_config(&account);
        tokio::spawn(async move {
            let client = tokimo_package_mail::MailClient::new(cfg);
            let result = if mark_read {
                client.mark_read(&folder.name, &uids).await
            } else {
                client.mark_unread(&folder.name, &uids).await
            };
            if let Err(e) = result {
                tracing::warn!(
                    "Failed to update IMAP flags for {} UIDs in '{}': {e}",
                    uids.len(),
                    folder.name
                );
            }
        });
    }
}

fn strip_null_bytes(s: &str) -> String {
    s.replace('\0', "")
}

fn parse_addrs(json: &serde_json::Value) -> Vec<MailAddressOutput> {
    serde_json::from_value::<Vec<MailAddressOutput>>(json.clone()).unwrap_or_default()
}

fn parse_ids(ids: &[String]) -> Result<Vec<i32>, AppError> {
    ids.iter()
        .map(|s| {
            s.parse::<i32>()
                .map_err(|_| AppError::BadRequest(format!("invalid message id: {s}")))
        })
        .collect()
}
