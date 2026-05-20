use axum::{
    extract::{Json, Path, Query, State},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use ts_rs::TS;
use uuid::Uuid;

use crate::ctx::AppCtx;
use crate::error::AppError;

use super::{ApiResponse, ok, parse_user_id};
use crate::services;

// ── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MailProviderPresetOutput {
    pub provider: String,
    pub display_name: String,
    pub imap_host: String,
    #[ts(type = "number")]
    pub imap_port: u16,
    pub imap_security: String,
    pub smtp_host: String,
    #[ts(type = "number")]
    pub smtp_port: u16,
    pub smtp_security: String,
    pub setup_instructions: Vec<String>,
    pub requires_app_password: bool,
    pub app_password_url: Option<String>,
    pub domains: Vec<String>,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MailAccountOutput {
    pub id: String,
    pub display_name: String,
    pub email: String,
    pub provider: String,
    pub imap_host: String,
    #[ts(type = "number")]
    pub imap_port: i32,
    pub imap_security: String,
    pub smtp_host: String,
    #[ts(type = "number")]
    pub smtp_port: i32,
    pub smtp_security: String,
    pub sender_name: Option<String>,
    pub is_enabled: bool,
    #[ts(type = "number")]
    pub sync_interval: i32,
    pub last_sync_at: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct CreateAccountBody {
    pub display_name: String,
    pub email: String,
    pub provider: Option<String>,
    pub imap_host: String,
    pub imap_port: Option<i32>,
    pub imap_security: Option<String>,
    pub imap_username: String,
    pub imap_password: String,
    pub smtp_host: String,
    pub smtp_port: Option<i32>,
    pub smtp_security: Option<String>,
    pub smtp_username: String,
    pub smtp_password: String,
    pub sender_name: Option<String>,
    pub sync_interval: Option<i32>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct UpdateAccountBody {
    pub display_name: Option<String>,
    pub imap_host: Option<String>,
    pub imap_port: Option<i32>,
    pub imap_security: Option<String>,
    pub imap_username: Option<String>,
    pub imap_password: Option<String>,
    pub smtp_host: Option<String>,
    pub smtp_port: Option<i32>,
    pub smtp_security: Option<String>,
    pub smtp_username: Option<String>,
    pub smtp_password: Option<String>,
    pub sender_name: Option<String>,
    pub is_enabled: Option<bool>,
    pub sync_interval: Option<i32>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct DetectProviderQuery {
    pub email: String,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

pub async fn list_providers() -> impl IntoResponse {
    let presets = tokimo_mail::provider::all_provider_presets();
    let output: Vec<MailProviderPresetOutput> = presets
        .into_iter()
        .map(|p| MailProviderPresetOutput {
            provider: format!("{:?}", p.provider).to_lowercase(),
            display_name: p.display_name,
            imap_host: p.imap_host,
            imap_port: p.imap_port,
            imap_security: format!("{:?}", p.imap_security).to_lowercase(),
            smtp_host: p.smtp_host,
            smtp_port: p.smtp_port,
            smtp_security: format!("{:?}", p.smtp_security).to_lowercase(),
            setup_instructions: p.setup_instructions,
            requires_app_password: p.requires_app_password,
            app_password_url: p.app_password_url,
            domains: p.domains,
        })
        .collect();
    ok(output)
}

pub async fn detect_provider(Query(q): Query<DetectProviderQuery>) -> impl IntoResponse {
    let preset = tokimo_mail::provider::detect_provider(&q.email);
    match preset {
        Some(p) => ok(Some(MailProviderPresetOutput {
            provider: format!("{:?}", p.provider).to_lowercase(),
            display_name: p.display_name,
            imap_host: p.imap_host,
            imap_port: p.imap_port,
            imap_security: format!("{:?}", p.imap_security).to_lowercase(),
            smtp_host: p.smtp_host,
            smtp_port: p.smtp_port,
            smtp_security: format!("{:?}", p.smtp_security).to_lowercase(),
            setup_instructions: p.setup_instructions,
            requires_app_password: p.requires_app_password,
            app_password_url: p.app_password_url,
            domains: p.domains,
        })),
        None => ok(None::<MailProviderPresetOutput>),
    }
}

pub async fn list_accounts(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
) -> Result<Json<ApiResponse<Vec<MailAccountOutput>>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let accounts = services::accounts::list_accounts(&ctx.db, uid).await?;
    Ok(ok(accounts))
}

pub async fn create_account(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Json(body): Json<CreateAccountBody>,
) -> Result<Json<ApiResponse<MailAccountOutput>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let account = services::accounts::create_account(&ctx.db, uid, body).await?;
    Ok(ok(account))
}

pub async fn get_account(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<MailAccountOutput>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let account_id: Uuid = id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    let account = services::accounts::get_account(&ctx.db, uid, account_id).await?;
    Ok(ok(account))
}

pub async fn update_account(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateAccountBody>,
) -> Result<Json<ApiResponse<MailAccountOutput>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let account_id: Uuid = id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    let account = services::accounts::update_account(&ctx.db, uid, account_id, body).await?;
    Ok(ok(account))
}

pub async fn delete_account(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let account_id: Uuid = id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    services::accounts::delete_account(&ctx.db, uid, account_id).await?;
    Ok(ok(()))
}

pub async fn test_connection(
    State(ctx): State<Arc<AppCtx>>,
    tokimo_bus_auth::TokimoUser { user_id }: tokimo_bus_auth::TokimoUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid = parse_user_id(&user_id)?;
    let account_id: Uuid = id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid account id".into()))?;
    services::accounts::test_connection(&ctx.db, uid, account_id).await?;
    Ok(ok(()))
}
