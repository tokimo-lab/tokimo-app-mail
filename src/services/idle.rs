use std::collections::{HashMap, HashSet};
use std::time::Duration;

use sea_orm::DatabaseConnection;
use tokio::task::JoinHandle;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::apps::mail::repos;
use crate::db::entities::mail_folders;
use crate::error::AppError;
use crate::queue::{AppEvent, AppEventSender};

use super::accounts::account_to_config;
use super::sync::store_summaries_batch;

/// Start the IMAP IDLE manager.
/// Spawns a long-lived tokio task that maintains one persistent IDLE connection
/// per enabled mail account (on the INBOX folder). When the server pushes an
/// EXISTS notification (new mail arrived), a forward sync is triggered immediately
/// and `mail:new_messages` is broadcast over WebSocket.
pub fn start(db: DatabaseConnection, event_tx: AppEventSender) {
    info!("IDLE manager: starting");
    tokio::spawn(run_manager(db, event_tx));
}

// ── Manager ──────────────────────────────────────────────────────────────────

/// Periodically checks for new/removed accounts and manages per-account IDLE tasks.
async fn run_manager(db: DatabaseConnection, event_tx: AppEventSender) {
    let mut account_tasks: HashMap<Uuid, JoinHandle<()>> = HashMap::new();

    loop {
        let accounts = repos::accounts::find_enabled_for_sync(&db)
            .await
            .unwrap_or_default();

        info!("IDLE manager: found {} enabled accounts", accounts.len());

        let active_ids: HashSet<Uuid> = accounts.iter().map(|a| a.id).collect();

        // Cancel tasks for accounts that are no longer enabled/present.
        account_tasks.retain(|id, handle| {
            if active_ids.contains(id) {
                true
            } else {
                handle.abort();
                false
            }
        });

        // Spawn a new IDLE task for each newly-discovered account.
        for account in &accounts {
            if account_tasks.contains_key(&account.id) {
                continue;
            }
            let cfg = account_to_config(account);
            let account_id = account.id;
            let db2 = db.clone();
            let tx2 = event_tx.clone();
            let handle = tokio::spawn(async move {
                info!("IDLE: starting loop for account {account_id}");
                run_account_idle(db2, tx2, cfg, account_id).await;
            });
            account_tasks.insert(account_id, handle);
        }

        tokio::time::sleep(Duration::from_secs(30)).await;
    }
}

// ── Per-account IDLE loop ─────────────────────────────────────────────────────

async fn run_account_idle(
    db: DatabaseConnection,
    event_tx: AppEventSender,
    cfg: tokimo_mail::MailAccountConfig,
    account_id: Uuid,
) {
    let mut backoff = Duration::from_secs(5);

    loop {
        // 2-minute IDLE window. On timeout we still run a forward sync so that
        // servers (e.g. QQ Mail) that don't reliably push EXISTS are caught within 2 min.
        match do_idle_cycle(&cfg).await {
            Ok(new_data) => {
                backoff = Duration::from_secs(5);
                if new_data {
                    info!("IDLE: EXISTS notification for account {account_id}, syncing inbox");
                } else {
                    debug!("IDLE: 2-min timeout for {account_id}, running forward sync");
                }

                // Small delay: QQ Mail fires EXISTS before the message is available for FETCH.
                tokio::time::sleep(Duration::from_secs(2)).await;

                let folder = repos::folders::find_inbox(&db, account_id)
                    .await
                    .unwrap_or(None);

                if let Some(folder) = folder {
                    match forward_sync_inbox(&db, &cfg, account_id, &folder, &event_tx).await {
                        Ok(0) if new_data => {
                            // Empty fetch after EXISTS — message not yet visible. Retry once.
                            tokio::time::sleep(Duration::from_secs(3)).await;
                            if let Err(e) = forward_sync_inbox(&db, &cfg, account_id, &folder, &event_tx).await {
                                warn!("IDLE: inbox sync retry failed for {account_id}: {e}");
                            }
                        }
                        Ok(_) => {}
                        Err(e) => warn!("IDLE: inbox forward sync failed for {account_id}: {e}"),
                    }
                }
            }
            Err(e) => {
                warn!("IDLE error for {account_id}: {e}, retry in {backoff:?}");
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(Duration::from_secs(300));
            }
        }
    }
}

/// Open a fresh connection, SELECT INBOX, enter IDLE for up to 2 minutes.
/// Returns `Ok(true)` if server pushed new data (EXISTS), `Ok(false)` on clean timeout.
async fn do_idle_cycle(
    cfg: &tokimo_mail::MailAccountConfig,
) -> Result<bool, tokimo_mail::MailError> {
    let mut session = tokimo_mail::MailSession::connect(cfg).await?;
    session.open_folder("INBOX").await?;
    let (session, new_data) = session.into_idle_wait(2 * 60).await?;
    session.logout().await;
    Ok(new_data)
}

// ── Forward sync triggered by IDLE ───────────────────────────────────────────

/// Fetch UIDs > max stored UID and persist new message summaries.
/// Emits `AppEvent::MailNewMessages` when at least one new message is stored.
async fn forward_sync_inbox(
    db: &DatabaseConnection,
    cfg: &tokimo_mail::MailAccountConfig,
    account_id: Uuid,
    folder: &mail_folders::Model,
    event_tx: &AppEventSender,
) -> Result<usize, AppError> {
    let max_uid = repos::messages::max_uid_in_folder(db, account_id, folder.id).await?;
    let Some(max_uid) = max_uid else {
        // Folder has no messages in DB yet — full sync will handle it.
        return Ok(0);
    };

    let mut imap = tokimo_mail::MailSession::connect(cfg)
        .await
        .map_err(|e| AppError::Internal(format!("IDLE sync connect: {e}")))?;

    imap.open_folder(&folder.name)
        .await
        .map_err(|e| AppError::Internal(format!("IDLE sync SELECT '{}': {e}", folder.name)))?;

    let uid_range = format!("{}:*", max_uid + 1);
    let stored = match imap.fetch_summaries_by_uids(&uid_range).await {
        Ok(summaries) if !summaries.is_empty() => {
            let count = summaries.len();
            store_summaries_batch(db, account_id, folder, &summaries).await?;
            info!(
                "IDLE: stored {} new message(s) in '{}' for account {account_id}",
                count, folder.name
            );

            let _ = event_tx.send(AppEvent::MailNewMessages {
                account_id: account_id.to_string(),
                folder_id: folder.id.to_string(),
                count,
            });

            // Refresh unread count for the sidebar badge.
            let unread = repos::messages::count_unread(db, folder.id).await?;
            repos::folders::update_unread_count(db, folder.id, unread as i32).await?;
            let _ = event_tx.send(AppEvent::MailFolderCounts {
                account_id: account_id.to_string(),
                folders: vec![crate::queue::MailFolderCountItem {
                    folder_id: folder.id.to_string(),
                    unread_count: unread,
                }],
            });
            count
        }
        Ok(_) => {
            debug!("IDLE: no new messages in INBOX for {account_id} (EXISTS was a flag change or not yet available)");
            0
        }
        Err(e) => {
            warn!("IDLE: FETCH failed for '{}': {e}", folder.name);
            return Err(AppError::Internal(format!("IDLE FETCH: {e}")));
        }
    };

    imap.logout().await;
    Ok(stored)
}
