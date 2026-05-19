use axum::Router;
use axum::routing::{get, post};
use std::sync::Arc;

use super::handlers;
use crate::AppState;

pub fn build_mail_app_routes() -> Router<Arc<AppState>> {
    Router::new()
        // ── Provider presets ──
        .route(
            "/api/apps/mail/providers",
            get(handlers::accounts::list_providers),
        )
        .route(
            "/api/apps/mail/providers/detect",
            get(handlers::accounts::detect_provider),
        )
        // ── Accounts CRUD ──
        .route(
            "/api/apps/mail/accounts",
            get(handlers::accounts::list_accounts).post(handlers::accounts::create_account),
        )
        .route(
            "/api/apps/mail/accounts/{id}",
            get(handlers::accounts::get_account)
                .patch(handlers::accounts::update_account)
                .delete(handlers::accounts::delete_account),
        )
        .route(
            "/api/apps/mail/accounts/{id}/test",
            post(handlers::accounts::test_connection),
        )
        // ── Folders ──
        .route(
            "/api/apps/mail/accounts/{account_id}/folders",
            get(handlers::folders::list_folders),
        )
        .route(
            "/api/apps/mail/accounts/{account_id}/folders/sync",
            post(handlers::folders::sync_folders),
        )
        // ── Messages ──
        .route(
            "/api/apps/mail/accounts/{account_id}/folders/{folder_id}/messages",
            get(handlers::messages::list_messages),
        )
        .route(
            "/api/apps/mail/messages/{message_id}",
            get(handlers::messages::get_message),
        )
        .route(
            "/api/apps/mail/messages/{message_id}/refetch-body",
            post(handlers::messages::refetch_body),
        )
        .route(
            "/api/apps/mail/messages/read",
            post(handlers::messages::mark_read),
        )
        .route(
            "/api/apps/mail/messages/unread",
            post(handlers::messages::mark_unread),
        )
        .route(
            "/api/apps/mail/messages/delete",
            post(handlers::messages::delete_messages),
        )
        .route(
            "/api/apps/mail/messages/move",
            post(handlers::messages::move_messages),
        )
        // ── Send ──
        .route(
            "/api/apps/mail/accounts/{account_id}/send",
            post(handlers::messages::send_message),
        )
        // ── Search ──
        .route(
            "/api/apps/mail/accounts/{account_id}/search",
            get(handlers::messages::search_messages),
        )
}
