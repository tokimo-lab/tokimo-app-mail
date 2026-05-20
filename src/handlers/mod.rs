pub mod accounts;
pub mod folders;
pub mod messages;

use axum::Json;
use serde::Serialize;

use crate::error::AppError;

/// 统一 API 响应包装 — 同主 server 的 ApiResponse 格式：
/// `{ success: true, data: T }`，前端 callApi 依赖 `success` 字段判定成败。
#[derive(Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn ok<T: Serialize>(data: T) -> Json<ApiResponse<T>> {
    Json(ApiResponse {
        success: true,
        data: Some(data),
        error: None,
    })
}

/// Parse user_id string to Uuid, returning AppError on failure.
pub fn parse_user_id(user_id: &str) -> Result<uuid::Uuid, AppError> {
    uuid::Uuid::parse_str(user_id).map_err(|_| AppError::BadRequest("invalid user id".into()))
}
