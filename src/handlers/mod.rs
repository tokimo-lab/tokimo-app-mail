pub mod accounts;
pub mod folders;
pub mod messages;

use axum::Json;
use serde::Serialize;

use crate::error::AppError;

/// 统一 API 响应包装 — 同主 server 的 ApiResponse。
#[derive(Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub data: T,
}

pub fn ok<T: Serialize>(data: T) -> Json<ApiResponse<T>> {
    Json(ApiResponse { data })
}

/// Parse user_id string to Uuid, returning AppError on failure.
pub fn parse_user_id(user_id: &str) -> Result<uuid::Uuid, AppError> {
    uuid::Uuid::parse_str(user_id).map_err(|_| AppError::BadRequest("invalid user id".into()))
}
