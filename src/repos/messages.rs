use chrono::{DateTime, FixedOffset};
use sea_orm::sea_query::{Expr, NullOrdering};
use sea_orm::*;
use uuid::Uuid;

use crate::db::entities::{mail_attachments, mail_messages};
use crate::error::AppError;

pub async fn max_uid_in_folder<C: ConnectionTrait>(
    db: &C,
    account_id: Uuid,
    folder_id: Uuid,
) -> Result<Option<i32>, AppError> {
    let result = mail_messages::Entity::find()
        .filter(mail_messages::Column::AccountId.eq(account_id))
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .select_only()
        .column_as(mail_messages::Column::Uid.max(), "max_uid")
        .into_tuple::<Option<i32>>()
        .one(db)
        .await?;
    Ok(result.flatten())
}

pub async fn min_uid_in_folder<C: ConnectionTrait>(
    db: &C,
    account_id: Uuid,
    folder_id: Uuid,
) -> Result<Option<i32>, AppError> {
    let result = mail_messages::Entity::find()
        .filter(mail_messages::Column::AccountId.eq(account_id))
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .select_only()
        .column_as(mail_messages::Column::Uid.min(), "min_uid")
        .into_tuple::<Option<i32>>()
        .one(db)
        .await?;
    Ok(result.flatten())
}

pub async fn list_by_folder<C: ConnectionTrait>(
    db: &C,
    folder_id: Uuid,
    page: u32,
    page_size: u32,
) -> Result<(Vec<mail_messages::Model>, i64), AppError> {
    let total = mail_messages::Entity::find()
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .count(db)
        .await? as i64;

    let offset = u64::from((page - 1) * page_size);
    let messages = mail_messages::Entity::find()
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .order_by_with_nulls(mail_messages::Column::Date, Order::Desc, NullOrdering::Last)
        .order_by_desc(mail_messages::Column::Uid)
        .offset(offset)
        .limit(u64::from(page_size))
        .all(db)
        .await?;

    Ok((messages, total))
}

pub async fn find_by_id<C: ConnectionTrait>(db: &C, id: i32) -> Result<Option<mail_messages::Model>, AppError> {
    Ok(mail_messages::Entity::find_by_id(id).one(db).await?)
}

#[allow(dead_code)]
pub async fn exists_by_uid<C: ConnectionTrait>(
    db: &C,
    account_id: Uuid,
    folder_id: Uuid,
    uid: i32,
) -> Result<bool, AppError> {
    let count = mail_messages::Entity::find()
        .filter(mail_messages::Column::AccountId.eq(account_id))
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .filter(mail_messages::Column::Uid.eq(uid))
        .count(db)
        .await?;
    Ok(count > 0)
}

pub async fn existing_uids_in_folder<C: ConnectionTrait>(
    db: &C,
    account_id: Uuid,
    folder_id: Uuid,
    uids: &[i32],
) -> Result<std::collections::HashSet<i32>, AppError> {
    use sea_orm::prelude::*;
    let rows = mail_messages::Entity::find()
        .select_only()
        .column(mail_messages::Column::Uid)
        .filter(mail_messages::Column::AccountId.eq(account_id))
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .filter(mail_messages::Column::Uid.is_in(uids.iter().copied()))
        .into_tuple::<i32>()
        .all(db)
        .await?;
    Ok(rows.into_iter().collect())
}

pub async fn count_unread<C: ConnectionTrait>(db: &C, folder_id: Uuid) -> Result<i64, AppError> {
    let count = mail_messages::Entity::find()
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .filter(mail_messages::Column::IsRead.eq(false))
        .count(db)
        .await?;
    Ok(count as i64)
}

pub async fn count_in_folder<C: ConnectionTrait>(db: &C, folder_id: Uuid) -> Result<i64, AppError> {
    let count = mail_messages::Entity::find()
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .count(db)
        .await?;
    Ok(count as i64)
}

pub async fn list_uids_in_folder<C: ConnectionTrait>(
    db: &C,
    account_id: Uuid,
    folder_id: Uuid,
) -> Result<Vec<(i32, i32, bool)>, AppError> {
    Ok(mail_messages::Entity::find()
        .filter(mail_messages::Column::AccountId.eq(account_id))
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .select_only()
        .column(mail_messages::Column::Id)
        .column(mail_messages::Column::Uid)
        .column(mail_messages::Column::IsRead)
        .into_tuple::<(i32, i32, bool)>()
        .all(db)
        .await?)
}

pub async fn update_read_by_uids<C: ConnectionTrait>(
    db: &C,
    account_id: Uuid,
    folder_id: Uuid,
    uids: &[i32],
    is_read: bool,
) -> Result<u64, AppError> {
    if uids.is_empty() {
        return Ok(0);
    }
    let result = mail_messages::Entity::update_many()
        .filter(mail_messages::Column::AccountId.eq(account_id))
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .filter(mail_messages::Column::Uid.is_in(uids.iter().copied()))
        .col_expr(mail_messages::Column::IsRead, Expr::value(is_read))
        .exec(db)
        .await?;
    Ok(result.rows_affected)
}

#[allow(clippy::too_many_arguments)]
#[allow(dead_code)]
pub async fn create<C: ConnectionTrait>(
    db: &C,
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
    let now = chrono::Utc::now().fixed_offset();

    let model = mail_messages::ActiveModel {
        id: NotSet,
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
        body_fetched: Set(true),
        created_at: Set(now),
    };
    Ok(mail_messages::Entity::insert(model).exec_with_returning(db).await?)
}

pub async fn update_read_status<C: ConnectionTrait>(db: &C, ids: &[i32], is_read: bool) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }
    mail_messages::Entity::update_many()
        .filter(mail_messages::Column::Id.is_in(ids.iter().copied()))
        .col_expr(mail_messages::Column::IsRead, Expr::value(is_read))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn delete_many<C: ConnectionTrait>(db: &C, ids: &[i32]) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }
    mail_messages::Entity::delete_many()
        .filter(mail_messages::Column::Id.is_in(ids.iter().copied()))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn delete_all_in_folder<C: ConnectionTrait>(
    db: &C,
    account_id: Uuid,
    folder_id: Uuid,
) -> Result<u64, AppError> {
    let res = mail_messages::Entity::delete_many()
        .filter(mail_messages::Column::AccountId.eq(account_id))
        .filter(mail_messages::Column::FolderId.eq(folder_id))
        .exec(db)
        .await?;
    Ok(res.rows_affected)
}

pub async fn reset_body_fetched<C: ConnectionTrait>(db: &C, id: i32) -> Result<(), AppError> {
    mail_messages::Entity::update_many()
        .filter(mail_messages::Column::Id.eq(id))
        .col_expr(mail_messages::Column::BodyFetched, Expr::value(false))
        .col_expr(mail_messages::Column::TextBody, Expr::value(Option::<String>::None))
        .col_expr(mail_messages::Column::HtmlBody, Expr::value(Option::<String>::None))
        .col_expr(mail_messages::Column::Preview, Expr::value(String::new()))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn move_to_folder<C: ConnectionTrait>(db: &C, ids: &[i32], folder_id: Uuid) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }
    mail_messages::Entity::update_many()
        .filter(mail_messages::Column::Id.is_in(ids.iter().copied()))
        .col_expr(mail_messages::Column::FolderId, Expr::value(folder_id))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn search<C: ConnectionTrait>(
    db: &C,
    account_id: Uuid,
    query: &str,
) -> Result<Vec<mail_messages::Model>, AppError> {
    let pattern = format!("%{query}%");
    Ok(mail_messages::Entity::find()
        .filter(mail_messages::Column::AccountId.eq(account_id))
        .filter(
            sea_orm::sea_query::Condition::any()
                .add(mail_messages::Column::Subject.like(&pattern))
                .add(mail_messages::Column::Preview.like(&pattern))
                .add(mail_messages::Column::TextBody.like(&pattern)),
        )
        .order_by_with_nulls(mail_messages::Column::Date, Order::Desc, NullOrdering::Last)
        .limit(100)
        .all(db)
        .await?)
}

pub async fn list_attachments<C: ConnectionTrait>(
    db: &C,
    message_id: i32,
) -> Result<Vec<mail_attachments::Model>, AppError> {
    Ok(mail_attachments::Entity::find()
        .filter(mail_attachments::Column::MessageId.eq(message_id))
        .all(db)
        .await?)
}

pub async fn create_attachment<C: ConnectionTrait>(
    db: &C,
    message_id: i32,
    filename: &str,
    content_type: &str,
    size: i32,
    data: Option<&str>,
) -> Result<mail_attachments::Model, AppError> {
    let model = mail_attachments::ActiveModel {
        id: NotSet,
        message_id: Set(message_id),
        filename: Set(filename.to_string()),
        content_type: Set(content_type.to_string()),
        size: Set(size),
        data: Set(data.map(ToString::to_string)),
    };
    Ok(mail_attachments::Entity::insert(model).exec_with_returning(db).await?)
}

pub async fn create_from_summary<C: ConnectionTrait>(
    db: &C,
    account_id: Uuid,
    folder_id: Uuid,
    s: &tokimo_package_mail::MailMessageSummary,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().fixed_offset();
    let is_read = s.flags.iter().any(|f| f == "\\Seen");
    let is_flagged = s.flags.iter().any(|f| f == "\\Flagged");
    let from_json = serde_json::to_value(&s.from).unwrap_or_default();
    let to_json = serde_json::to_value(&s.to).unwrap_or_default();
    let flags_json = serde_json::to_value(&s.flags).unwrap_or_default();

    let model = mail_messages::ActiveModel {
        id: NotSet,
        account_id: Set(account_id),
        folder_id: Set(folder_id),
        uid: Set(s.uid as i32),
        message_id: Set(s.message_id.clone()),
        subject: Set(s.subject.clone()),
        from_addrs: Set(from_json),
        to_addrs: Set(to_json),
        cc_addrs: Set(None),
        bcc_addrs: Set(None),
        reply_to_addrs: Set(None),
        in_reply_to: Set(None),
        refs: Set(None),
        date: Set(s.date),
        text_body: Set(None),
        html_body: Set(None),
        preview: Set(String::new()),
        flags: Set(flags_json),
        is_read: Set(is_read),
        is_flagged: Set(is_flagged),
        has_attachments: Set(s.has_attachments),
        size: Set(s.size as i32),
        body_fetched: Set(false),
        created_at: Set(now),
    };
    mail_messages::Entity::insert(model).exec(db).await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn update_body<C: ConnectionTrait>(
    db: &C,
    id: i32,
    text_body: Option<&str>,
    html_body: Option<&str>,
    preview: &str,
    cc_addrs: Option<serde_json::Value>,
    bcc_addrs: Option<serde_json::Value>,
    reply_to_addrs: Option<serde_json::Value>,
    in_reply_to: Option<String>,
    refs: Option<String>,
) -> Result<(), AppError> {
    mail_messages::Entity::update_many()
        .filter(mail_messages::Column::Id.eq(id))
        .col_expr(
            mail_messages::Column::TextBody,
            Expr::value(text_body.map(ToString::to_string)),
        )
        .col_expr(
            mail_messages::Column::HtmlBody,
            Expr::value(html_body.map(ToString::to_string)),
        )
        .col_expr(mail_messages::Column::Preview, Expr::value(preview.to_string()))
        .col_expr(mail_messages::Column::CcAddrs, Expr::value(cc_addrs))
        .col_expr(mail_messages::Column::BccAddrs, Expr::value(bcc_addrs))
        .col_expr(mail_messages::Column::ReplyToAddrs, Expr::value(reply_to_addrs))
        .col_expr(mail_messages::Column::InReplyTo, Expr::value(in_reply_to))
        .col_expr(mail_messages::Column::Refs, Expr::value(refs))
        .col_expr(mail_messages::Column::BodyFetched, Expr::value(true))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn list_unfetched<C: ConnectionTrait>(db: &C, limit: u64) -> Result<Vec<(i32, Uuid, i32, Uuid)>, AppError> {
    let rows = mail_messages::Entity::find()
        .filter(mail_messages::Column::BodyFetched.eq(false))
        .filter(mail_messages::Column::TextBody.is_null())
        .filter(mail_messages::Column::HtmlBody.is_null())
        .order_by_desc(mail_messages::Column::Uid)
        .limit(limit)
        .select_only()
        .columns([
            mail_messages::Column::Id,
            mail_messages::Column::FolderId,
            mail_messages::Column::Uid,
            mail_messages::Column::AccountId,
        ])
        .into_tuple::<(i32, Uuid, i32, Uuid)>()
        .all(db)
        .await?;
    Ok(rows)
}
