use async_trait::async_trait;
use sea_orm::DatabaseConnection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tracing::debug;

use crate::scheduler::ScheduledTask;

/// Background task that fetches full message bodies for summaries stored without body.
pub struct MailBodyFetchTask {
    db: DatabaseConnection,
    is_running: AtomicBool,
}

impl MailBodyFetchTask {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            db,
            is_running: AtomicBool::new(false),
        }
    }
}

#[async_trait]
impl ScheduledTask for MailBodyFetchTask {
    fn name(&self) -> &'static str {
        "MailBodyFetchTask"
    }

    fn interval(&self) -> Duration {
        Duration::from_secs(15)
    }

    fn run_on_startup(&self) -> bool {
        false
    }

    async fn run(&self) -> Result<(), String> {
        if self.is_running.swap(true, Ordering::Relaxed) {
            debug!("MailBodyFetchTask: already running, skipping");
            return Ok(());
        }

        let result = crate::apps::mail::services::body_fetch::run_cycle(&self.db)
            .await
            .map_err(|e| format!("MailBodyFetchTask: {e}"));

        self.is_running.store(false, Ordering::Relaxed);
        result
    }
}
