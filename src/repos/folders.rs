use sea_orm::sea_query::Expr;
use sea_orm::*;
use uuid::Uuid;

use crate::db::entities::mail_folders;
use crate::error::AppError;

pub async fn list_by_account<C: ConnectionTrait>(db: &C, account_id: Uuid) -> Result<Vec<mail_folders::Model>, AppError> {
    Ok(mail_folders::Entity::find()
        .filter(mail_folders::Column::AccountId.eq(account_id))
        .order_by_asc(mail_folders::Column::SortOrder)
        .order_by_asc(mail_folders::Column::Name)
        .all(db)
        .await?)
}

pub async fn find_by_id<C: ConnectionTrait>(db: &C, folder_id: Uuid) -> Result<Option<mail_folders::Model>, AppError> {
    Ok(mail_folders::Entity::find_by_id(folder_id).one(db).await?)
}

pub async fn update_unread_count<C: ConnectionTrait>(db: &C, folder_id: Uuid, unread_count: i32) -> Result<(), AppError> {
    let now = chrono::Utc::now().fixed_offset();
    mail_folders::Entity::update_many()
        .filter(mail_folders::Column::Id.eq(folder_id))
        .col_expr(mail_folders::Column::UnreadCount, Expr::value(unread_count))
        .col_expr(mail_folders::Column::UpdatedAt, Expr::value(now))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn reset_uid_validity<C: ConnectionTrait>(db: &C, folder_id: Uuid, uid_validity: u32) -> Result<(), AppError> {
    let now = chrono::Utc::now().fixed_offset();
    #[allow(clippy::cast_possible_wrap)]
    let stored = uid_validity as i32;
    mail_folders::Entity::update_many()
        .filter(mail_folders::Column::Id.eq(folder_id))
        .col_expr(mail_folders::Column::UidValidity, Expr::value(stored))
        .col_expr(
            mail_folders::Column::HistorySyncCursor,
            Expr::value(Option::<i32>::None),
        )
        .col_expr(mail_folders::Column::UpdatedAt, Expr::value(now))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn find_by_name<C: ConnectionTrait>(
    db: &C,
    account_id: Uuid,
    name: &str,
) -> Result<Option<mail_folders::Model>, AppError> {
    Ok(mail_folders::Entity::find()
        .filter(mail_folders::Column::AccountId.eq(account_id))
        .filter(mail_folders::Column::Name.eq(name))
        .one(db)
        .await?)
}

#[allow(clippy::too_many_arguments)]
pub async fn upsert<C: ConnectionTrait>(
    db: &C,
    account_id: Uuid,
    name: &str,
    delimiter: Option<&str>,
    folder_type: &str,
    attributes: &[String],
    total_count: i32,
    unread_count: i32,
    sort_order: i32,
) -> Result<mail_folders::Model, AppError> {
    let now = chrono::Utc::now().fixed_offset();
    let attrs_json = serde_json::to_value(attributes).unwrap_or_default();

    if let Some(_existing) = find_by_name(db, account_id, name).await? {
        let mut stmt = mail_folders::Entity::update_many()
            .filter(mail_folders::Column::AccountId.eq(account_id))
            .filter(mail_folders::Column::Name.eq(name))
            .col_expr(mail_folders::Column::FolderType, Expr::value(folder_type.to_string()))
            .col_expr(mail_folders::Column::Attributes, Expr::value(Some(attrs_json)))
            .col_expr(mail_folders::Column::TotalCount, Expr::value(total_count))
            .col_expr(mail_folders::Column::UnreadCount, Expr::value(unread_count))
            .col_expr(mail_folders::Column::SortOrder, Expr::value(sort_order))
            .col_expr(mail_folders::Column::UpdatedAt, Expr::value(now));
        if let Some(d) = delimiter {
            stmt = stmt.col_expr(mail_folders::Column::Delimiter, Expr::value(Some(d.to_string())));
        }
        let results = stmt.exec_with_returning(db).await?;
        return results
            .into_iter()
            .next()
            .ok_or_else(|| AppError::Internal("upsert failed".into()));
    }

    let id = Uuid::new_v4();
    let model = mail_folders::ActiveModel {
        id: Set(id),
        account_id: Set(account_id),
        name: Set(name.to_string()),
        delimiter: Set(delimiter.map(ToString::to_string)),
        folder_type: Set(folder_type.to_string()),
        attributes: Set(Some(attrs_json)),
        total_count: Set(total_count),
        unread_count: Set(unread_count),
        uid_validity: Set(None),
        uid_next: Set(None),
        sort_order: Set(sort_order),
        history_sync_cursor: Set(None),
        updated_at: Set(now),
    };
    Ok(mail_folders::Entity::insert(model)
        .exec_with_returning(db)
        .await?)
}

pub async fn delete_absent<C: ConnectionTrait>(db: &C, account_id: Uuid, existing_names: &[&str]) -> Result<(), AppError> {
    if existing_names.is_empty() {
        return Ok(());
    }
    let names: Vec<String> = existing_names.iter().map(|s| ToString::to_string(*s)).collect();
    mail_folders::Entity::delete_many()
        .filter(mail_folders::Column::AccountId.eq(account_id))
        .filter(mail_folders::Column::Name.is_not_in(names))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn find_inbox<C: ConnectionTrait>(db: &C, account_id: Uuid) -> Result<Option<mail_folders::Model>, AppError> {
    Ok(mail_folders::Entity::find()
        .filter(mail_folders::Column::AccountId.eq(account_id))
        .filter(mail_folders::Column::FolderType.eq("inbox"))
        .one(db)
        .await?)
}
