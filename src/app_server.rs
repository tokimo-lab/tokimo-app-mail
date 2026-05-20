//! 内嵌 axum HTTP server，监听本地 UDS socket。
//!
//! 路由布局（server 端 `/api/apps/mail/<rest>` 反代到本 sock 的 `/<rest>`）。

use std::sync::Arc;

use axum::{
    Router,
    extract::DefaultBodyLimit,
    routing::{get, post},
};
use tokimo_bus_protocol::{BusListener, DataPlaneSocket};
use tracing::{error, info};

use crate::{assets, ctx::AppCtx, handlers};

pub async fn spawn(service: &str, ctx: Arc<AppCtx>) -> anyhow::Result<DataPlaneSocket> {
    let (listener, socket) = BusListener::bind_for_app(service)?;
    info!(?socket, "mail: app server listening");

    let router = build_router(ctx);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            error!(error = %e, "mail: app server stopped");
        }
    });

    Ok(socket)
}

fn build_router(ctx: Arc<AppCtx>) -> Router {
    Router::new()
        // ── Provider presets ──
        .route("/providers", get(handlers::accounts::list_providers))
        .route("/providers/detect", get(handlers::accounts::detect_provider))
        // ── Accounts CRUD ──
        .route(
            "/accounts",
            get(handlers::accounts::list_accounts).post(handlers::accounts::create_account),
        )
        .route(
            "/accounts/{id}",
            get(handlers::accounts::get_account)
                .patch(handlers::accounts::update_account)
                .delete(handlers::accounts::delete_account),
        )
        .route("/accounts/{id}/test", post(handlers::accounts::test_connection))
        // ── Folders ──
        .route("/accounts/{account_id}/folders", get(handlers::folders::list_folders))
        .route("/accounts/{account_id}/folders/sync", post(handlers::folders::sync_folders))
        // ── Messages ──
        .route(
            "/accounts/{account_id}/folders/{folder_id}/messages",
            get(handlers::messages::list_messages),
        )
        .route("/messages/{message_id}", get(handlers::messages::get_message))
        .route("/messages/{message_id}/refetch-body", post(handlers::messages::refetch_body))
        .route("/messages/read", post(handlers::messages::mark_read))
        .route("/messages/unread", post(handlers::messages::mark_unread))
        .route("/messages/delete", post(handlers::messages::delete_messages))
        .route("/messages/move", post(handlers::messages::move_messages))
        // ── Send ──
        .route(
            "/accounts/{account_id}/send",
            post(handlers::messages::send_message).layer(DefaultBodyLimit::disable()),
        )
        // ── Search ──
        .route("/accounts/{account_id}/search", get(handlers::messages::search_messages))
        // ── Assets ──
        .route("/assets/{*path}", get(assets::serve))
        .with_state(ctx)
}
