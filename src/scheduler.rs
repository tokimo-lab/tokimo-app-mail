//! 本地 scheduler — tokio interval 循环，管理定期同步和 body fetch。

use std::sync::Arc;
use std::time::Duration;

use sea_orm::DatabaseConnection;
use tokimo_bus_client::BusClient;
use tracing::{info, warn};

use crate::services::body_fetch;
use crate::services::idle;
use crate::services::sync::{self, BusBroadcaster};

pub fn start(db: DatabaseConnection, bus_client: Arc<BusClient>) {
    info!("mail scheduler: starting");

    let db2 = db.clone();
    tokio::spawn(async move {
        sync_loop(db2).await;
    });

    let db3 = db.clone();
    tokio::spawn(async move {
        body_fetch_loop(db3).await;
    });

    idle::start(db, BusBroadcaster::new(bus_client));
}

async fn sync_loop(db: DatabaseConnection) {
    let mut interval = tokio::time::interval(Duration::from_secs(300));
    loop {
        interval.tick().await;
        let accounts = crate::repos::accounts::find_enabled_for_sync(&db)
            .await
            .unwrap_or_default();

        for account in accounts {
            if let Err(e) = sync::sync_account(&db, account.user_id, account.id, None).await {
                warn!("scheduler: sync failed for account {}: {e}", account.id);
            }
        }
    }
}

async fn body_fetch_loop(db: DatabaseConnection) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    loop {
        interval.tick().await;
        if let Err(e) = body_fetch::run_cycle(&db).await {
            warn!("scheduler: body fetch failed: {e}");
        }
    }
}
