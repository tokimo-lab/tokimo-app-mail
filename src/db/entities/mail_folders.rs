//! SeaORM Entity — mail.mail_folders

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "mail_folders")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub account_id: Uuid,
    #[sea_orm(column_type = "Text")]
    pub name: String,
    #[sea_orm(column_type = "Text", nullable)]
    pub delimiter: Option<String>,
    #[sea_orm(column_type = "Text")]
    pub folder_type: String,
    #[sea_orm(column_type = "JsonBinary", nullable)]
    pub attributes: Option<Json>,
    pub total_count: i32,
    pub unread_count: i32,
    pub uid_validity: Option<i32>,
    pub uid_next: Option<i32>,
    pub sort_order: i32,
    pub updated_at: DateTimeWithTimeZone,
    pub history_sync_cursor: Option<i32>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
#[allow(clippy::enum_variant_names)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::mail_accounts::Entity",
        from = "Column::AccountId",
        to = "super::mail_accounts::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    MailAccounts,
    #[sea_orm(has_many = "super::mail_messages::Entity")]
    MailMessages,
}

impl Related<super::mail_accounts::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MailAccounts.def()
    }
}

impl Related<super::mail_messages::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MailMessages.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
