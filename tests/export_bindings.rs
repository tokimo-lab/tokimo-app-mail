//! ts-rs type export — run with `cargo test -p tokimo-app-mail -- export_bindings`
//! Generates TypeScript types to `ui/src/generated/rust-types/`.

// Trigger ts-rs export by referencing all DTO types.
#[allow(unused_imports)]
use tokimo_app_mail::handlers::accounts::{
    CreateAccountBody, DetectProviderQuery, MailAccountOutput, MailProviderPresetOutput, UpdateAccountBody,
};
#[allow(unused_imports)]
use tokimo_app_mail::handlers::folders::MailFolderOutput;
#[allow(unused_imports)]
use tokimo_app_mail::handlers::messages::{
    BulkMessageIdsBody, ListMessagesQuery, MailAddressOutput, MailAttachmentOutput, MailMessageFullOutput,
    MailMessageListOutput, MailMessageSummaryOutput, MoveMessagesBody, SearchQuery, SendMessageBody,
};
