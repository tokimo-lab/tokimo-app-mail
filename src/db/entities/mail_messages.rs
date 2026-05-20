//! SeaORM Entity — mail.mail_messages

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(schema_name = "mail", table_name = "mail_messages")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub account_id: Uuid,
    pub folder_id: Uuid,
    pub uid: i32,
    #[sea_orm(column_type = "Text", nullable)]
    pub message_id: Option<String>,
    #[sea_orm(column_type = "Text")]
    pub subject: String,
    #[sea_orm(column_type = "JsonBinary")]
    pub from_addrs: Json,
    #[sea_orm(column_type = "JsonBinary")]
    pub to_addrs: Json,
    #[sea_orm(column_type = "JsonBinary", nullable)]
    pub cc_addrs: Option<Json>,
    #[sea_orm(column_type = "JsonBinary", nullable)]
    pub bcc_addrs: Option<Json>,
    #[sea_orm(column_type = "JsonBinary", nullable)]
    pub reply_to_addrs: Option<Json>,
    #[sea_orm(column_type = "Text", nullable)]
    pub in_reply_to: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub refs: Option<String>,
    pub date: Option<DateTimeWithTimeZone>,
    #[sea_orm(column_type = "Text", nullable)]
    pub text_body: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub html_body: Option<String>,
    #[sea_orm(column_type = "Text")]
    pub preview: String,
    #[sea_orm(column_type = "JsonBinary")]
    pub flags: Json,
    pub is_read: bool,
    pub is_flagged: bool,
    pub has_attachments: bool,
    pub size: i32,
    pub created_at: DateTimeWithTimeZone,
    pub body_fetched: bool,
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
    #[sea_orm(has_many = "super::mail_attachments::Entity")]
    MailAttachments,
    #[sea_orm(
        belongs_to = "super::mail_folders::Entity",
        from = "Column::FolderId",
        to = "super::mail_folders::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    MailFolders,
}

impl Related<super::mail_accounts::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MailAccounts.def()
    }
}

impl Related<super::mail_attachments::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MailAttachments.def()
    }
}

impl Related<super::mail_folders::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MailFolders.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
