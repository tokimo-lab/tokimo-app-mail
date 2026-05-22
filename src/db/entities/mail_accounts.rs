//! SeaORM Entity — mail.mail_accounts

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "mail_accounts")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub user_id: Uuid,
    #[sea_orm(column_type = "Text")]
    pub display_name: String,
    #[sea_orm(column_type = "Text")]
    pub email: String,
    #[sea_orm(column_type = "Text")]
    pub provider: String,
    #[sea_orm(column_type = "Text")]
    pub imap_host: String,
    pub imap_port: i32,
    #[sea_orm(column_type = "Text")]
    pub imap_security: String,
    #[sea_orm(column_type = "Text")]
    pub imap_username: String,
    #[sea_orm(column_type = "Text")]
    pub imap_password: String,
    #[sea_orm(column_type = "Text")]
    pub smtp_host: String,
    pub smtp_port: i32,
    #[sea_orm(column_type = "Text")]
    pub smtp_security: String,
    #[sea_orm(column_type = "Text")]
    pub smtp_username: String,
    #[sea_orm(column_type = "Text")]
    pub smtp_password: String,
    #[sea_orm(column_type = "Text", nullable)]
    pub sender_name: Option<String>,
    pub is_enabled: bool,
    pub sync_interval: i32,
    pub last_sync_at: Option<DateTimeWithTimeZone>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
#[allow(clippy::enum_variant_names)]
pub enum Relation {
    #[sea_orm(has_many = "super::mail_folders::Entity")]
    MailFolders,
    #[sea_orm(has_many = "super::mail_messages::Entity")]
    MailMessages,
}

impl Related<super::mail_folders::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MailFolders.def()
    }
}

impl Related<super::mail_messages::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MailMessages.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
