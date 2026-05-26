use std::collections::{HashMap, HashSet};
use std::time::Duration;

use sea_orm::DatabaseConnection;
use tokio::task::JoinHandle;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::db::entities::mail_folders;
use crate::error::AppError;
use crate::repos;

use super::accounts::account_to_config;
use super::sync::{EventBroadcaster, store_summaries_batch};

pub fn start(db: DatabaseConnection, event_tx: impl EventBroadcaster) {
    info!("IDLE manager: starting");
    tokio::spawn(run_manager(db, Box::new(event_tx)));
}

async fn run_manager(db: DatabaseConnection, event_tx: Box<dyn EventBroadcaster>) {
    let mut account_tasks: HashMap<Uuid, JoinHandle<()>> = HashMap::new();

    loop {
        let accounts = repos::accounts::find_enabled_for_sync(&db).await.unwrap_or_default();
        info!("IDLE manager: found {} enabled accounts", accounts.len());

        let active_ids: HashSet<Uuid> = accounts.iter().map(|a| a.id).collect();

        account_tasks.retain(|id, handle| {
            if active_ids.contains(id) {
                true
            } else {
                handle.abort();
                false
            }
        });

        for account in &accounts {
            if account_tasks.contains_key(&account.id) {
                continue;
            }
            let cfg = account_to_config(account);
            let account_id = account.id;
            let user_id = account.user_id;
            let db2 = db.clone();
            let tx2 = event_tx.clone_box();
            let handle = tokio::spawn(async move {
                info!("IDLE: starting loop for account {account_id}");
                run_account_idle(db2, tx2, cfg, account_id, user_id).await;
            });
            account_tasks.insert(account_id, handle);
        }

        tokio::time::sleep(Duration::from_secs(30)).await;
    }
}

async fn run_account_idle(
    db: DatabaseConnection,
    event_tx: Box<dyn EventBroadcaster>,
    cfg: tokimo_package_mail::MailAccountConfig,
    account_id: Uuid,
    user_id: Uuid,
) {
    let mut backoff = Duration::from_secs(5);

    loop {
        match do_idle_cycle(&cfg).await {
            Ok(new_data) => {
                backoff = Duration::from_secs(5);
                if new_data {
                    info!("IDLE: EXISTS notification for account {account_id}, syncing inbox");
                } else {
                    debug!("IDLE: 2-min timeout for {account_id}, running forward sync");
                }

                tokio::time::sleep(Duration::from_secs(2)).await;

                let folder = repos::folders::find_inbox(&db, account_id).await.unwrap_or(None);

                if let Some(folder) = folder {
                    match forward_sync_inbox(&db, &cfg, account_id, user_id, &folder, event_tx.as_ref()).await {
                        Ok(0) if new_data => {
                            tokio::time::sleep(Duration::from_secs(3)).await;
                            if let Err(e) = forward_sync_inbox(&db, &cfg, account_id, user_id, &folder, event_tx.as_ref()).await
                            {
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
                backoff = (backoff * 2).min(Duration::from_mins(5));
            }
        }
    }
}

async fn do_idle_cycle(cfg: &tokimo_package_mail::MailAccountConfig) -> Result<bool, tokimo_package_mail::MailError> {
    let mut session = tokimo_package_mail::MailSession::connect(cfg).await?;
    session.open_folder("INBOX").await?;
    let (session, new_data) = session.into_idle_wait(2 * 60).await?;
    session.logout().await;
    Ok(new_data)
}

async fn forward_sync_inbox(
    db: &DatabaseConnection,
    cfg: &tokimo_package_mail::MailAccountConfig,
    account_id: Uuid,
    user_id: Uuid,
    folder: &mail_folders::Model,
    event_tx: &dyn EventBroadcaster,
) -> Result<usize, AppError> {
    let max_uid = repos::messages::max_uid_in_folder(db, account_id, folder.id).await?;
    let Some(max_uid) = max_uid else {
        return Ok(0);
    };

    let mut imap = tokimo_package_mail::MailSession::connect(cfg)
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

            event_tx.broadcast_new_messages(user_id, &account_id.to_string(), &folder.id.to_string(), count);

            let unread = repos::messages::count_unread(db, folder.id).await?;
            repos::folders::update_unread_count(db, folder.id, unread as i32).await?;
            event_tx.broadcast_folder_counts(user_id, &account_id.to_string(), vec![(folder.id.to_string(), unread)]);
            count
        }
        Ok(_) => {
            debug!("IDLE: no new messages in INBOX for {account_id}");
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
