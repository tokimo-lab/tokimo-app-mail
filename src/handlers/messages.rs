use axum::{
    extract::{Json, Path, Query, State},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use ts_rs::TS;
use uuid::Uuid;

use crate::error::AppError;
use crate::handlers::{ok, ApiResponse};
use crate::handlers::user::AuthUser;
use crate::AppState;

use super::super::services;

// ── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MailAddressOutput {
    pub name: Option<String>,
    pub address: String,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MailMessageSummaryOutput {
    pub id: String,
    #[ts(type = "number")]
    pub uid: i32,
    pub message_id: Option<String>,
    pub subject: String,
    pub from: Vec<MailAddressOutput>,
    pub to: Vec<MailAddressOutput>,
    pub date: Option<String>,
    pub is_read: bool,
    pub is_flagged: bool,
    pub has_attachments: bool,
    pub preview: String,
    #[ts(type = "number")]
    pub size: i32,
    pub folder_id: String,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MailMessageListOutput {
    pub messages: Vec<MailMessageSummaryOutput>,
    #[ts(type = "number")]
    pub total: i64,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MailAttachmentOutput {
    pub id: String,
    pub filename: String,
    pub content_type: String,
    #[ts(type = "number")]
    pub size: i32,
    /// Base64-encoded data (only present when fetching full message).
    pub data: Option<String>,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MailMessageFullOutput {
    pub id: String,
    #[ts(type = "number")]
    pub uid: i32,
    pub message_id: Option<String>,
    pub subject: String,
    pub from: Vec<MailAddressOutput>,
    pub to: Vec<MailAddressOutput>,
    pub cc: Vec<MailAddressOutput>,
    pub bcc: Vec<MailAddressOutput>,
    pub reply_to: Vec<MailAddressOutput>,
    pub date: Option<String>,
    pub is_read: bool,
    pub is_flagged: bool,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
    pub text_body: Option<String>,
    pub html_body: Option<String>,
    pub attachments: Vec<MailAttachmentOutput>,
    #[ts(type = "number")]
    pub size: i32,
    pub folder_id: String,
    pub account_id: String,
}

#[derive(Deserialize)]
pub struct ListMessagesQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Deserialize)]
pub struct BulkMessageIdsBody {
    pub message_ids: Vec<String>,
}

#[derive(Deserialize)]
pub struct MoveMessagesBody {
    pub message_ids: Vec<String>,
    pub target_folder_id: String,
}

#[derive(Deserialize)]
pub struct SendMessageBody {
    pub to: Vec<String>,
    pub cc: Option<Vec<String>>,
    pub bcc: Option<Vec<String>>,
    pub subject: String,
    pub text_body: Option<String>,
    pub html_body: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub folder_id: Option<String>,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/// GET /api/apps/mail/accounts/:account_id/folders/:folder_id/messages
pub async fn list_messages(
    State(state): State<Arc<AppState>>,
    AuthUser(user): AuthUser,
    Path((account_id, folder_id)): Path<(String, String)>,
    Query(q): Query<ListMessagesQuery>,
) -> Result<Json<ApiResponse<MailMessageListOutput>>, AppError> {
    let uid: Uuid = user
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let aid: Uuid = account_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    let fid: Uuid = folder_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid folder id".into()))?;

    let page = q.page.unwrap_or(1);
    let page_size = q.page_size.unwrap_or(50).min(200);

    let result =
        services::messages::list_messages(&state.db, uid, aid, fid, page, page_size).await?;
    Ok(ok(result))
}

/// GET /api/apps/mail/messages/:message_id — fetch full message.
pub async fn get_message(
    State(state): State<Arc<AppState>>,
    AuthUser(user): AuthUser,
    Path(message_id): Path<String>,
) -> Result<Json<ApiResponse<MailMessageFullOutput>>, AppError> {
    let uid: Uuid = user
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let mid: Uuid = message_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid message id".into()))?;
    let msg = services::messages::get_message(&state.db, uid, mid).await?;
    Ok(ok(msg))
}

/// POST /api/apps/mail/messages/read
pub async fn mark_read(
    State(state): State<Arc<AppState>>,
    AuthUser(user): AuthUser,
    Json(body): Json<BulkMessageIdsBody>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid: Uuid = user
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    services::messages::mark_read(&state.db, uid, &body.message_ids).await?;
    Ok(ok(()))
}

/// POST /api/apps/mail/messages/unread
pub async fn mark_unread(
    State(state): State<Arc<AppState>>,
    AuthUser(user): AuthUser,
    Json(body): Json<BulkMessageIdsBody>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid: Uuid = user
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    services::messages::mark_unread(&state.db, uid, &body.message_ids).await?;
    Ok(ok(()))
}

/// POST /api/apps/mail/messages/delete
pub async fn delete_messages(
    State(state): State<Arc<AppState>>,
    AuthUser(user): AuthUser,
    Json(body): Json<BulkMessageIdsBody>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid: Uuid = user
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    services::messages::delete_messages(&state.db, uid, &body.message_ids).await?;
    Ok(ok(()))
}

/// POST /api/apps/mail/messages/:message_id/refetch-body
pub async fn refetch_body(
    State(state): State<Arc<AppState>>,
    AuthUser(user): AuthUser,
    Path(message_id): Path<String>,
) -> Result<Json<ApiResponse<MailMessageFullOutput>>, AppError> {
    let uid: Uuid = user
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let mid: Uuid = message_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid message id".into()))?;
    let msg = services::messages::refetch_body(&state.db, uid, mid).await?;
    Ok(ok(msg))
}

/// POST /api/apps/mail/messages/move
pub async fn move_messages(
    State(state): State<Arc<AppState>>,
    AuthUser(user): AuthUser,
    Json(body): Json<MoveMessagesBody>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid: Uuid = user
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    services::messages::move_messages(&state.db, uid, &body.message_ids, &body.target_folder_id)
        .await?;
    Ok(ok(()))
}

/// POST /api/apps/mail/accounts/:account_id/send
pub async fn send_message(
    State(state): State<Arc<AppState>>,
    AuthUser(user): AuthUser,
    Path(account_id): Path<String>,
    Json(body): Json<SendMessageBody>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid: Uuid = user
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let aid: Uuid = account_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    services::messages::send_message(&state.db, uid, aid, body).await?;
    Ok(ok(()))
}

/// GET /api/apps/mail/accounts/:account_id/search?q=xxx
pub async fn search_messages(
    State(state): State<Arc<AppState>>,
    AuthUser(user): AuthUser,
    Path(account_id): Path<String>,
    Query(q): Query<SearchQuery>,
) -> Result<Json<ApiResponse<MailMessageListOutput>>, AppError> {
    let uid: Uuid = user
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let aid: Uuid = account_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    let results = services::messages::search_messages(&state.db, uid, aid, &q.q).await?;
    Ok(ok(results))
}
