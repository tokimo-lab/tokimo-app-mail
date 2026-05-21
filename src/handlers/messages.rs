use axum::extract::{Json, Multipart, Path, Query, State};
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use ts_rs::TS;
use uuid::Uuid;

use crate::ctx::AppCtx;
use crate::error::AppError;

use super::{ApiResponse, ok, parse_user_id};
use crate::services;

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

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct ListMessagesQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct BulkMessageIdsBody {
    pub message_ids: Vec<String>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct MoveMessagesBody {
    pub message_ids: Vec<String>,
    pub target_folder_id: String,
}

#[derive(Deserialize, TS)]
#[ts(export)]
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

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct SearchQuery {
    pub q: String,
    #[allow(dead_code)]
    pub folder_id: Option<String>,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

pub async fn list_messages(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Path((account_id, folder_id)): Path<(String, String)>,
    Query(q): Query<ListMessagesQuery>,
) -> Result<Json<ApiResponse<MailMessageListOutput>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let aid: Uuid = account_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    let fid: Uuid = folder_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid folder id".into()))?;
    let page = q.page.unwrap_or(1);
    let page_size = q.page_size.unwrap_or(50).min(200);
    let result = services::messages::list_messages(&ctx.db, uid, aid, fid, page, page_size).await?;
    Ok(ok(result))
}

pub async fn get_message(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Path(message_id): Path<String>,
) -> Result<Json<ApiResponse<MailMessageFullOutput>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let mid: i32 = message_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid message id".into()))?;
    let msg = services::messages::get_message(&ctx.db, uid, mid).await?;
    Ok(ok(msg))
}

pub async fn mark_read(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Json(body): Json<BulkMessageIdsBody>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    services::messages::mark_read(&ctx.db, uid, &body.message_ids).await?;
    Ok(ok(()))
}

pub async fn mark_unread(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Json(body): Json<BulkMessageIdsBody>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    services::messages::mark_unread(&ctx.db, uid, &body.message_ids).await?;
    Ok(ok(()))
}

pub async fn delete_messages(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Json(body): Json<BulkMessageIdsBody>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    services::messages::delete_messages(&ctx.db, uid, &body.message_ids).await?;
    Ok(ok(()))
}

pub async fn refetch_body(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Path(message_id): Path<String>,
) -> Result<Json<ApiResponse<MailMessageFullOutput>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let mid: i32 = message_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid message id".into()))?;
    let msg = services::messages::refetch_body(&ctx.db, uid, mid).await?;
    Ok(ok(msg))
}

pub async fn move_messages(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Json(body): Json<MoveMessagesBody>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    services::messages::move_messages(&ctx.db, uid, &body.message_ids, &body.target_folder_id).await?;
    Ok(ok(()))
}

pub async fn send_message(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Path(account_id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let aid: Uuid = account_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;

    const MAX_FILE_BYTES: usize = 25 * 1024 * 1024;
    const MAX_TOTAL_BYTES: usize = 50 * 1024 * 1024;

    let mut body: Option<SendMessageBody> = None;
    let mut attachments: Vec<tokimo_mail::message::ComposeAttachment> = Vec::new();
    let mut total_bytes: usize = 0;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart error: {e}")))?
    {
        match field.name() {
            Some("payload") => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("payload read error: {e}")))?;
                body = Some(
                    serde_json::from_str::<SendMessageBody>(&text)
                        .map_err(|e| AppError::BadRequest(format!("invalid payload JSON: {e}")))?,
                );
            }
            Some("attachments") => {
                let filename = field.file_name().unwrap_or("attachment").to_string();
                let content_type = field.content_type().unwrap_or("application/octet-stream").to_string();
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("attachment read error: {e}")))?;
                if data.len() > MAX_FILE_BYTES {
                    return Err(AppError::BadRequest(format!(
                        "attachment '{filename}' exceeds 25 MB limit"
                    )));
                }
                total_bytes += data.len();
                if total_bytes > MAX_TOTAL_BYTES {
                    return Err(AppError::BadRequest("total attachment size exceeds 50 MB limit".into()));
                }
                attachments.push(tokimo_mail::message::ComposeAttachment {
                    filename,
                    content_type,
                    data: general_purpose::STANDARD.encode(&data),
                });
            }
            _ => {}
        }
    }

    let body = body.ok_or_else(|| AppError::BadRequest("missing 'payload' field".into()))?;
    services::messages::send_message(&ctx.db, uid, aid, body, attachments).await?;
    Ok(ok(()))
}

pub async fn search_messages(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Path(account_id): Path<String>,
    Query(q): Query<SearchQuery>,
) -> Result<Json<ApiResponse<MailMessageListOutput>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let aid: Uuid = account_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    let result = services::messages::search_messages(&ctx.db, uid, aid, &q.q).await?;
    Ok(ok(result))
}
