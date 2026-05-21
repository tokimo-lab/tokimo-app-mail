use sea_orm::*;
use uuid::Uuid;

use crate::db::entities::mail_accounts;
use crate::error::AppError;

use crate::handlers::accounts::{CreateAccountBody, MailAccountOutput, UpdateAccountBody};
use crate::repos;

pub async fn list_accounts(db: &DatabaseConnection, user_id: Uuid) -> Result<Vec<MailAccountOutput>, AppError> {
    let accounts = repos::accounts::list_by_user(db, user_id).await?;
    Ok(accounts.into_iter().map(model_to_output).collect())
}

pub async fn get_account(
    db: &DatabaseConnection,
    user_id: Uuid,
    account_id: Uuid,
) -> Result<MailAccountOutput, AppError> {
    let account = repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Mail account not found".into()))?;
    Ok(model_to_output(account))
}

pub async fn create_account(
    db: &DatabaseConnection,
    user_id: Uuid,
    body: CreateAccountBody,
) -> Result<MailAccountOutput, AppError> {
    let model = repos::accounts::create(
        db,
        user_id,
        body.display_name,
        body.email,
        body.provider.unwrap_or_else(|| "custom".into()),
        body.imap_host,
        body.imap_port.unwrap_or(993),
        body.imap_security.unwrap_or_else(|| "tls".into()),
        body.imap_username,
        body.imap_password,
        body.smtp_host,
        body.smtp_port.unwrap_or(465),
        body.smtp_security.unwrap_or_else(|| "tls".into()),
        body.smtp_username,
        body.smtp_password,
        body.sender_name,
        body.sync_interval.unwrap_or(300),
    )
    .await?;
    Ok(model_to_output(model))
}

pub async fn update_account(
    db: &DatabaseConnection,
    user_id: Uuid,
    account_id: Uuid,
    body: UpdateAccountBody,
) -> Result<MailAccountOutput, AppError> {
    let existing = repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Mail account not found".into()))?;

    let mut active: mail_accounts::ActiveModel = existing.into();

    if let Some(v) = body.display_name {
        active.display_name = Set(v);
    }
    if let Some(v) = body.imap_host {
        active.imap_host = Set(v);
    }
    if let Some(v) = body.imap_port {
        active.imap_port = Set(v);
    }
    if let Some(v) = body.imap_security {
        active.imap_security = Set(v);
    }
    if let Some(v) = body.imap_username {
        active.imap_username = Set(v);
    }
    if let Some(v) = body.imap_password {
        active.imap_password = Set(v);
    }
    if let Some(v) = body.smtp_host {
        active.smtp_host = Set(v);
    }
    if let Some(v) = body.smtp_port {
        active.smtp_port = Set(v);
    }
    if let Some(v) = body.smtp_security {
        active.smtp_security = Set(v);
    }
    if let Some(v) = body.smtp_username {
        active.smtp_username = Set(v);
    }
    if let Some(v) = body.smtp_password {
        active.smtp_password = Set(v);
    }
    if let Some(v) = body.sender_name {
        active.sender_name = Set(Some(v));
    }
    if let Some(v) = body.is_enabled {
        active.is_enabled = Set(v);
    }
    if let Some(v) = body.sync_interval {
        active.sync_interval = Set(v);
    }

    active.updated_at = Set(chrono::Utc::now().fixed_offset());
    let model = active.update(db).await?;
    Ok(model_to_output(model))
}

pub async fn delete_account(db: &DatabaseConnection, user_id: Uuid, account_id: Uuid) -> Result<(), AppError> {
    let existing = repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Mail account not found".into()))?;
    existing.delete(db).await?;
    Ok(())
}

pub async fn test_connection(db: &DatabaseConnection, user_id: Uuid, account_id: Uuid) -> Result<(), AppError> {
    let account = repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Mail account not found".into()))?;

    let cfg = account_to_config(&account);
    let client = tokimo_package_mail::MailClient::new(cfg);
    client
        .test_connection()
        .await
        .map_err(|e| AppError::BadRequest(format!("Connection test failed: {e}")))?;
    Ok(())
}

fn model_to_output(m: mail_accounts::Model) -> MailAccountOutput {
    MailAccountOutput {
        id: m.id.to_string(),
        display_name: m.display_name,
        email: m.email,
        provider: m.provider,
        imap_host: m.imap_host,
        imap_port: m.imap_port,
        imap_security: m.imap_security,
        smtp_host: m.smtp_host,
        smtp_port: m.smtp_port,
        smtp_security: m.smtp_security,
        sender_name: m.sender_name,
        is_enabled: m.is_enabled,
        sync_interval: m.sync_interval,
        last_sync_at: m.last_sync_at.map(|d| d.to_rfc3339()),
        created_at: m.created_at.to_rfc3339(),
    }
}

pub fn account_to_config(m: &mail_accounts::Model) -> tokimo_package_mail::MailAccountConfig {
    let imap_security = match m.imap_security.as_str() {
        "starttls" => tokimo_package_mail::config::SecurityMode::StartTls,
        "none" => tokimo_package_mail::config::SecurityMode::None,
        _ => tokimo_package_mail::config::SecurityMode::Tls,
    };
    let smtp_security = match m.smtp_security.as_str() {
        "starttls" => tokimo_package_mail::config::SecurityMode::StartTls,
        "none" => tokimo_package_mail::config::SecurityMode::None,
        _ => tokimo_package_mail::config::SecurityMode::Tls,
    };

    tokimo_package_mail::MailAccountConfig {
        display_name: m.display_name.clone(),
        email: m.email.clone(),
        imap_host: m.imap_host.clone(),
        imap_port: m.imap_port as u16,
        imap_security,
        imap_username: m.imap_username.clone(),
        imap_password: m.imap_password.clone(),
        smtp_host: m.smtp_host.clone(),
        smtp_port: m.smtp_port as u16,
        smtp_security,
        smtp_username: m.smtp_username.clone(),
        smtp_password: m.smtp_password.clone(),
        sender_name: m.sender_name.clone(),
    }
}
