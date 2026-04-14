use sea_orm::sea_query::Expr;
use sea_orm::*;
use uuid::Uuid;

use crate::db::entities::mail_folders;
use crate::error::AppError;

pub async fn list_by_account(
    db: &DatabaseConnection,
    account_id: Uuid,
) -> Result<Vec<mail_folders::Model>, AppError> {
    mail_folders::Entity::find()
        .filter(mail_folders::Column::AccountId.eq(account_id))
        .order_by_asc(mail_folders::Column::SortOrder)
        .order_by_asc(mail_folders::Column::Name)
        .all(db)
        .await
        .map_err(AppError::Database)
}

pub async fn find_by_id(
    db: &DatabaseConnection,
    folder_id: Uuid,
) -> Result<Option<mail_folders::Model>, AppError> {
    mail_folders::Entity::find_by_id(folder_id)
        .one(db)
        .await
        .map_err(AppError::Database)
}

/// Update folder's cached unread_count.
pub async fn update_unread_count(
    db: &DatabaseConnection,
    folder_id: Uuid,
    unread_count: i32,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().fixed_offset();
    mail_folders::Entity::update_many()
        .filter(mail_folders::Column::Id.eq(folder_id))
        .col_expr(mail_folders::Column::UnreadCount, Expr::value(unread_count))
        .col_expr(mail_folders::Column::UpdatedAt, Expr::value(now))
        .exec(db)
        .await
        .map_err(AppError::Database)?;
    Ok(())
}

pub async fn find_by_name(
    db: &DatabaseConnection,
    account_id: Uuid,
    name: &str,
) -> Result<Option<mail_folders::Model>, AppError> {
    mail_folders::Entity::find()
        .filter(mail_folders::Column::AccountId.eq(account_id))
        .filter(mail_folders::Column::Name.eq(name))
        .one(db)
        .await
        .map_err(AppError::Database)
}

#[allow(clippy::too_many_arguments)]
pub async fn upsert(
    db: &DatabaseConnection,
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

    // Try to find existing.
    if let Some(existing) = find_by_name(db, account_id, name).await? {
        let mut active: mail_folders::ActiveModel = existing.into();
        active.folder_type = Set(folder_type.to_string());
        active.attributes = Set(Some(attrs_json));
        active.total_count = Set(total_count);
        active.unread_count = Set(unread_count);
        active.sort_order = Set(sort_order);
        active.updated_at = Set(now);
        if let Some(d) = delimiter {
            active.delimiter = Set(Some(d.to_string()));
        }
        return active.update(db).await.map_err(AppError::Database);
    }

    // Create new.
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
    mail_folders::Entity::insert(model)
        .exec_with_returning(db)
        .await
        .map_err(AppError::Database)
}

/// Delete folders that no longer exist on the remote server.
pub async fn delete_absent(
    db: &DatabaseConnection,
    account_id: Uuid,
    existing_names: &[&str],
) -> Result<(), AppError> {
    if existing_names.is_empty() {
        return Ok(());
    }
    let names: Vec<String> = existing_names.iter().map(|s| ToString::to_string(*s)).collect();
    mail_folders::Entity::delete_many()
        .filter(mail_folders::Column::AccountId.eq(account_id))
        .filter(mail_folders::Column::Name.is_not_in(names))
        .exec(db)
        .await
        .map_err(AppError::Database)?;
    Ok(())
}
