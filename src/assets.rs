//! 静态资源服务 — rust_embed 嵌入 ui/dist/，开发时可通过环境变量覆盖。

use axum::http::{HeaderValue, header};
use axum::response::{IntoResponse, Response};
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "ui/dist/"]
#[prefix = ""]
struct EmbeddedUi;

pub async fn serve(path: Option<axum::extract::Path<String>>) -> impl IntoResponse {
    let path = path.map(|p| p.0).unwrap_or_default();
    let path = if path.is_empty() || path.ends_with('/') {
        format!("{path}index.html")
    } else {
        path
    };

    // 开发模式：从文件系统读取
    if let Ok(dir) = std::env::var("TOKIMO_APP_ASSETS_DIR") {
        let full = format!("{dir}/{path}");
        if let Ok(data) = std::fs::read(&full) {
            let mime = mime_from_path(&path);
            return Response::builder()
                .header(header::CONTENT_TYPE, mime)
                .header(header::CACHE_CONTROL, "no-store")
                .body(axum::body::Body::from(data))
                .unwrap();
        }
    }

    // 生产模式：从嵌入资源读取
    if let Some(content) = EmbeddedUi::get(&path) {
        let mime = mime_from_path(&path);
        Response::builder()
            .header(header::CONTENT_TYPE, mime)
            .header(header::CACHE_CONTROL, "no-store")
            .body(axum::body::Body::from(content.data.to_vec()))
            .unwrap()
    } else {
        Response::builder()
            .status(404)
            .body(axum::body::Body::from("not found"))
            .unwrap()
    }
}

fn mime_from_path(path: &str) -> HeaderValue {
    let mime = if path.ends_with(".js") {
        "application/javascript"
    } else if path.ends_with(".css") {
        "text/css"
    } else if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else if path.ends_with(".json") {
        "application/json"
    } else {
        "application/octet-stream"
    };
    HeaderValue::from_static(mime)
}
