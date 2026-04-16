use async_trait::async_trait;
use sea_orm::DatabaseConnection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tracing::{debug, info, warn};

use crate::apps::mail::repos;
use crate::queue::AppEventSender;
use crate::scheduler::ScheduledTask;

/// Background task that periodically syncs all enabled mail accounts.
pub struct MailSyncTask {
    db: DatabaseConnection,
    event_tx: AppEventSender,
    is_running: AtomicBool,
}

impl MailSyncTask {
    pub fn new(db: DatabaseConnection, event_tx: AppEventSender) -> Self {
        Self {
            db,
            event_tx,
            is_running: AtomicBool::new(false),
        }
    }
}

#[async_trait]
impl ScheduledTask for MailSyncTask {
    fn name(&self) -> &'static str {
        "MailSyncTask"
    }

    fn interval(&self) -> Duration {
        // Check every 60 seconds for accounts that need syncing.
        Duration::from_secs(60)
    }

    fn run_on_startup(&self) -> bool {
        false // Don't run on every server restart.
    }

    async fn run(&self) -> Result<(), String> {
        if self.is_running.swap(true, Ordering::Relaxed) {
            debug!("MailSyncTask: already running, skipping");
            return Ok(());
        }

        let result = self.do_sync().await;
        self.is_running.store(false, Ordering::Relaxed);
        result
    }
}

impl MailSyncTask {
    async fn do_sync(&self) -> Result<(), String> {
        let accounts = repos::accounts::find_enabled_for_sync(&self.db)
            .await
            .map_err(|e| format!("Failed to load mail accounts: {e}"))?;

        if accounts.is_empty() {
            return Ok(());
        }

        let now = chrono::Utc::now().fixed_offset();

        for account in &accounts {
            // Check if it's time to sync this account.
            let should_sync = match account.last_sync_at {
                Some(last) => {
                    let elapsed = (now - last).num_seconds();
                    elapsed >= i64::from(account.sync_interval)
                }
                None => true, // Never synced.
            };

            if !should_sync {
                continue;
            }

            info!("MailSyncTask: syncing account {} ({})", account.email, account.id);

            match crate::apps::mail::services::sync::sync_account(
                &self.db,
                account.user_id,
                account.id,
                Some(&self.event_tx),
            )
            .await
            {
                Ok(()) => {
                    debug!("MailSyncTask: account {} synced successfully", account.email);
                }
                Err(e) => {
                    warn!(
                        "MailSyncTask: failed to sync account {} ({}): {e}",
                        account.email, account.id
                    );
                }
            }
        }

        Ok(())
    }
}
