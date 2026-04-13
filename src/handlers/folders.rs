use axum::extract::{Json, Path, State};
use serde::Serialize;
use std::sync::Arc;
use ts_rs::TS;
use uuid::Uuid;

use crate::error::AppError;
use crate::handlers::{ok, ApiResponse};
use crate::handlers::user::AuthUser;
use crate::AppState;

use super::super::services;

// ── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct MailFolderOutput {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub delimiter: Option<String>,
    pub folder_type: String,
    #[ts(type = "number")]
    pub total_count: i32,
    #[ts(type = "number")]
    pub unread_count: i32,
    #[ts(type = "number")]
    pub sort_order: i32,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/// GET /api/apps/mail/accounts/:account_id/folders
pub async fn list_folders(
    State(state): State<Arc<AppState>>,
    AuthUser(user): AuthUser,
    Path(account_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<MailFolderOutput>>>, AppError> {
    let uid: Uuid = user
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let aid: Uuid = account_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    let folders = services::folders::list_folders(&state.db, uid, aid).await?;
    Ok(ok(folders))
}

/// POST /api/apps/mail/accounts/:account_id/folders/sync — sync folders from IMAP.
pub async fn sync_folders(
    State(state): State<Arc<AppState>>,
    AuthUser(user): AuthUser,
    Path(account_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<MailFolderOutput>>>, AppError> {
    let uid: Uuid = user
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let aid: Uuid = account_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    let folders = services::folders::sync_folders(&state.db, uid, aid).await?;
    Ok(ok(folders))
}
