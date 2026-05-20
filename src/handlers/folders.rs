use axum::extract::{Json, Path, State};
use serde::Serialize;
use std::sync::Arc;
use ts_rs::TS;
use uuid::Uuid;

use crate::ctx::AppCtx;
use crate::error::AppError;

use super::{ApiResponse, ok, parse_user_id};
use crate::services;

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
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

pub async fn list_folders(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Path(account_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<MailFolderOutput>>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let aid: Uuid = account_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    let folders = services::folders::list_folders(&ctx.db, uid, aid).await?;
    Ok(ok(folders))
}

pub async fn sync_folders(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Path(account_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<MailFolderOutput>>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let aid: Uuid = account_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    let folders = services::folders::sync_folders(&ctx.db, uid, aid).await?;
    Ok(ok(folders))
}
