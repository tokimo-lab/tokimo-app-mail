use std::collections::HashMap;
use tracing::{debug, info, warn};
use uuid::Uuid;

use sea_orm::DatabaseConnection;

use super::accounts::account_to_config;
use crate::error::AppError;
use crate::repos;

const BATCH_SIZE: u64 = 100;
const IMAP_BATCH: usize = 50;

pub async fn run_cycle(db: &DatabaseConnection) -> Result<(), AppError> {
    let unfetched = repos::messages::list_unfetched(db, BATCH_SIZE).await?;
    if unfetched.is_empty() {
        return Ok(());
    }

    debug!("Body fetch: {} messages need body fetching", unfetched.len());

    let mut by_account: HashMap<Uuid, Vec<(i32, Uuid, i32)>> = HashMap::new();
    for (msg_id, folder_id, uid, account_id) in &unfetched {
        by_account
            .entry(*account_id)
            .or_default()
            .push((*msg_id, *folder_id, *uid));
    }

    for (account_id, messages) in by_account {
        if let Err(e) = fetch_for_account(db, account_id, messages).await {
            warn!("Body fetch: account {account_id} failed: {e}");
        }
    }

    Ok(())
}

async fn fetch_for_account(
    db: &DatabaseConnection,
    account_id: Uuid,
    messages: Vec<(i32, Uuid, i32)>,
) -> Result<(), AppError> {
    let account = repos::accounts::find_by_id(db, account_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Mail account not found".into()))?;
    let cfg = account_to_config(&account);

    let mut imap = tokimo_package_mail::MailSession::connect(&cfg)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP connect for body fetch: {e}")))?;

    let folder_names = {
        let folder_ids: Vec<Uuid> = messages
            .iter()
            .map(|(_, fid, _)| *fid)
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        let mut map: HashMap<Uuid, String> = HashMap::new();
        for fid in folder_ids {
            if let Ok(Some(f)) = repos::folders::find_by_id(db, fid).await {
                map.insert(fid, f.name);
            }
        }
        map
    };

    let mut by_folder: HashMap<Uuid, Vec<(i32, i32)>> = HashMap::new();
    for (msg_id, folder_id, uid) in messages {
        by_folder.entry(folder_id).or_default().push((msg_id, uid));
    }

    for (folder_id, msgs) in by_folder {
        let Some(folder_name) = folder_names.get(&folder_id) else {
            warn!("Body fetch: unknown folder {folder_id}, skipping");
            continue;
        };

        if let Err(e) = imap.open_folder(folder_name).await {
            warn!("Body fetch: select folder '{folder_name}' failed: {e}");
            continue;
        }

        for chunk in msgs.chunks(IMAP_BATCH) {
            let uid_set = chunk
                .iter()
                .map(|(_, uid)| uid.to_string())
                .collect::<Vec<_>>()
                .join(",");

            let full_messages = match imap.fetch_messages_batch(&uid_set).await {
                Ok(m) => m,
                Err(e) => {
                    warn!("Body fetch: fetch_messages_batch for '{folder_name}' failed: {e}");
                    continue;
                }
            };

            let mut by_uid: HashMap<u32, &tokimo_package_mail::MailMessage> = HashMap::new();
            for m in &full_messages {
                by_uid.insert(m.uid, m);
            }

            for (msg_id, uid) in chunk {
                let Some(full) = by_uid.get(&(*uid as u32)) else {
                    continue;
                };

                let text_body = full.text_body.as_deref().map(strip_null_bytes);
                let html_body = full.html_body.as_deref().map(strip_null_bytes);

                let preview = text_body
                    .as_deref()
                    .map(|t| t.chars().take(200).collect::<String>())
                    .or_else(|| html_body.as_deref().map(|html| strip_html_preview(html, 200)))
                    .unwrap_or_default();

                let cc_json = serde_json::to_value(&full.cc).ok();
                let bcc_json = serde_json::to_value(&full.bcc).ok();
                let reply_to_json = serde_json::to_value(&full.reply_to).ok();
                let refs_str = if full.references.is_empty() {
                    None
                } else {
                    Some(full.references.join(" "))
                };

                if let Err(e) = repos::messages::update_body(
                    db,
                    *msg_id,
                    text_body.as_deref(),
                    html_body.as_deref(),
                    &preview,
                    cc_json,
                    bcc_json,
                    reply_to_json,
                    full.in_reply_to.clone(),
                    refs_str,
                )
                .await
                {
                    warn!("Body fetch: update_body for msg {msg_id} failed: {e}");
                    continue;
                }

                for att in &full.attachments {
                    if let Err(e) = repos::messages::create_attachment(
                        db,
                        *msg_id,
                        &att.filename,
                        &att.content_type,
                        att.size as i32,
                        att.data.as_deref(),
                    )
                    .await
                    {
                        warn!("Body fetch: attachment save failed: {e}");
                    }
                }
            }
        }
    }

    imap.logout().await;
    info!("Body fetch: account {account_id} cycle complete");
    Ok(())
}

fn strip_null_bytes(s: &str) -> String {
    s.replace('\0', "")
}

fn strip_html_preview(html: &str, max_chars: usize) -> String {
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
