use sea_orm::*;
use uuid::Uuid;

use crate::db::entities::mail_accounts;
use crate::error::AppError;

pub async fn list_by_user<C: ConnectionTrait>(db: &C, user_id: Uuid) -> Result<Vec<mail_accounts::Model>, AppError> {
    Ok(mail_accounts::Entity::find()
        .filter(mail_accounts::Column::UserId.eq(user_id))
        .order_by_asc(mail_accounts::Column::CreatedAt)
        .all(db)
        .await?)
}

pub async fn find_by_id<C: ConnectionTrait>(db: &C, id: Uuid) -> Result<Option<mail_accounts::Model>, AppError> {
    Ok(mail_accounts::Entity::find_by_id(id).one(db).await?)
}

pub async fn find_by_id_and_user<C: ConnectionTrait>(
    db: &C,
    id: Uuid,
    user_id: Uuid,
) -> Result<Option<mail_accounts::Model>, AppError> {
    Ok(mail_accounts::Entity::find_by_id(id)
        .filter(mail_accounts::Column::UserId.eq(user_id))
        .one(db)
        .await?)
}

pub async fn find_by_email_and_user<C: ConnectionTrait>(
    db: &C,
    email: &str,
    user_id: Uuid,
) -> Result<Option<mail_accounts::Model>, AppError> {
    Ok(mail_accounts::Entity::find()
        .filter(mail_accounts::Column::Email.eq(email))
        .filter(mail_accounts::Column::UserId.eq(user_id))
        .one(db)
        .await?)
}

pub async fn find_enabled_for_sync<C: ConnectionTrait>(db: &C) -> Result<Vec<mail_accounts::Model>, AppError> {
    Ok(mail_accounts::Entity::find()
        .filter(mail_accounts::Column::IsEnabled.eq(true))
        .all(db)
        .await?)
}

#[allow(clippy::too_many_arguments)]
pub async fn create<C: ConnectionTrait>(
    db: &C,
    user_id: Uuid,
    display_name: String,
    email: String,
    provider: String,
    imap_host: String,
    imap_port: i32,
    imap_security: String,
    imap_username: String,
    imap_password: String,
    smtp_host: String,
    smtp_port: i32,
    smtp_security: String,
    smtp_username: String,
    smtp_password: String,
    sender_name: Option<String>,
    sync_interval: i32,
) -> Result<mail_accounts::Model, AppError> {
    let id = Uuid::new_v4();
    let now = chrono::Utc::now().fixed_offset();
    let model = mail_accounts::ActiveModel {
        id: Set(id),
        user_id: Set(user_id),
        display_name: Set(display_name),
        email: Set(email),
        provider: Set(provider),
        imap_host: Set(imap_host),
        imap_port: Set(imap_port),
        imap_security: Set(imap_security),
        imap_username: Set(imap_username),
        imap_password: Set(imap_password),
        smtp_host: Set(smtp_host),
        smtp_port: Set(smtp_port),
        smtp_security: Set(smtp_security),
        smtp_username: Set(smtp_username),
        smtp_password: Set(smtp_password),
        sender_name: Set(sender_name),
        is_enabled: Set(true),
        sync_interval: Set(sync_interval),
        last_sync_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    };
    Ok(mail_accounts::Entity::insert(model)
        .exec_with_returning(db)
        .await?)
}
