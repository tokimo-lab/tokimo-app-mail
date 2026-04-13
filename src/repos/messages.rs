use chrono::{DateTime, FixedOffset};
use sea_orm::sea_query::Expr;
use sea_orm::*;
use uuid::Uuid;

use crate::db::entities::{mail_attachments, mail_messages};
use crate::error::AppError;

pub async fn list_by_folder(
    db: &DatabaseConnection,
    folder_id: Uuid,
    page: u32,
    page_size: u32,
) -> Result<(Vec<mail_messages::Model>, i64), AppError> {
    let total = mail_messages::Entity::find()
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .count(db)
        .await
        .map_err(AppError::Database)? as i64;

    let offset = u64::from((page - 1) * page_size);
    let messages = mail_messages::Entity::find()
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .order_by_desc(mail_messages::Column::Date)
        .order_by_desc(mail_messages::Column::Uid)
        .offset(offset)
        .limit(u64::from(page_size))
        .all(db)
        .await
        .map_err(AppError::Database)?;

    Ok((messages, total))
}

pub async fn find_by_id(
    db: &DatabaseConnection,
    id: Uuid,
) -> Result<Option<mail_messages::Model>, AppError> {
    mail_messages::Entity::find_by_id(id)
        .one(db)
        .await
        .map_err(AppError::Database)
}

pub async fn exists_by_uid(
    db: &DatabaseConnection,
    account_id: Uuid,
    folder_id: Uuid,
    uid: i32,
) -> Result<bool, AppError> {
    let count = mail_messages::Entity::find()
        .filter(mail_messages::Column::AccountId.eq(account_id))
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .filter(mail_messages::Column::Uid.eq(uid))
        .count(db)
        .await
        .map_err(AppError::Database)?;
    Ok(count > 0)
}

#[allow(clippy::too_many_arguments)]
pub async fn create(
    db: &DatabaseConnection,
    account_id: Uuid,
    folder_id: Uuid,
    uid: i32,
    message_id: Option<String>,
    subject: &str,
    from_addrs: serde_json::Value,
    to_addrs: serde_json::Value,
    cc_addrs: Option<serde_json::Value>,
    bcc_addrs: Option<serde_json::Value>,
    reply_to_addrs: Option<serde_json::Value>,
    in_reply_to: Option<String>,
    refs: Option<String>,
    date: Option<DateTime<FixedOffset>>,
    text_body: Option<&str>,
    html_body: Option<&str>,
    preview: &str,
    flags: serde_json::Value,
    is_read: bool,
    is_flagged: bool,
    has_attachments: bool,
    size: i32,
) -> Result<mail_messages::Model, AppError> {
    let id = Uuid::new_v4();
    let now = chrono::Utc::now().fixed_offset();

    let model = mail_messages::ActiveModel {
        id: Set(id),
        account_id: Set(account_id),
        folder_id: Set(folder_id),
        uid: Set(uid),
        message_id: Set(message_id),
        subject: Set(subject.to_string()),
        from_addrs: Set(from_addrs),
        to_addrs: Set(to_addrs),
        cc_addrs: Set(cc_addrs),
        bcc_addrs: Set(bcc_addrs),
        reply_to_addrs: Set(reply_to_addrs),
        in_reply_to: Set(in_reply_to),
        refs: Set(refs),
        date: Set(date),
        text_body: Set(text_body.map(ToString::to_string)),
        html_body: Set(html_body.map(ToString::to_string)),
        preview: Set(preview.to_string()),
        flags: Set(flags),
        is_read: Set(is_read),
        is_flagged: Set(is_flagged),
        has_attachments: Set(has_attachments),
        size: Set(size),
        created_at: Set(now),
    };
    mail_messages::Entity::insert(model)
        .exec_with_returning(db)
        .await
        .map_err(AppError::Database)
}

pub async fn update_read_status(
    db: &DatabaseConnection,
    ids: &[Uuid],
    is_read: bool,
) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }
    mail_messages::Entity::update_many()
        .filter(mail_messages::Column::Id.is_in(ids.iter().copied()))
        .col_expr(mail_messages::Column::IsRead, Expr::value(is_read))
        .exec(db)
        .await
        .map_err(AppError::Database)?;
    Ok(())
}

pub async fn delete_many(db: &DatabaseConnection, ids: &[Uuid]) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }
    mail_messages::Entity::delete_many()
        .filter(mail_messages::Column::Id.is_in(ids.iter().copied()))
        .exec(db)
        .await
        .map_err(AppError::Database)?;
    Ok(())
}

pub async fn move_to_folder(
    db: &DatabaseConnection,
    ids: &[Uuid],
    folder_id: Uuid,
) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }
    mail_messages::Entity::update_many()
        .filter(mail_messages::Column::Id.is_in(ids.iter().copied()))
        .col_expr(mail_messages::Column::FolderId, Expr::value(folder_id))
        .exec(db)
        .await
        .map_err(AppError::Database)?;
    Ok(())
}

pub async fn search(
    db: &DatabaseConnection,
    account_id: Uuid,
    query: &str,
) -> Result<Vec<mail_messages::Model>, AppError> {
    let pattern = format!("%{query}%");
    mail_messages::Entity::find()
        .filter(mail_messages::Column::AccountId.eq(account_id))
        .filter(
            sea_orm::sea_query::Condition::any()
                .add(mail_messages::Column::Subject.like(&pattern))
                .add(mail_messages::Column::Preview.like(&pattern))
                .add(mail_messages::Column::TextBody.like(&pattern)),
        )
        .order_by_desc(mail_messages::Column::Date)
        .limit(100)
        .all(db)
        .await
        .map_err(AppError::Database)
}

pub async fn list_attachments(
    db: &DatabaseConnection,
    message_id: Uuid,
) -> Result<Vec<mail_attachments::Model>, AppError> {
    mail_attachments::Entity::find()
        .filter(mail_attachments::Column::MessageId.eq(message_id))
        .all(db)
        .await
        .map_err(AppError::Database)
}

pub async fn create_attachment(
    db: &DatabaseConnection,
    message_id: Uuid,
    filename: &str,
    content_type: &str,
    size: i32,
    data: Option<&str>,
) -> Result<mail_attachments::Model, AppError> {
    let id = Uuid::new_v4();
    let model = mail_attachments::ActiveModel {
        id: Set(id),
        message_id: Set(message_id),
        filename: Set(filename.to_string()),
        content_type: Set(content_type.to_string()),
        size: Set(size),
        data: Set(data.map(ToString::to_string)),
    };
    mail_attachments::Entity::insert(model)
        .exec_with_returning(db)
        .await
        .map_err(AppError::Database)
}
