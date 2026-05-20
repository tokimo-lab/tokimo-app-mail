//! CLI entrypoints for mail app.

use anyhow::Context;
use chrono::Utc;
use sea_orm::DatabaseConnection;
use tokimo_bus_auth::db::{connect_db, verify_token};
use tokimo_bus_cli::{Credentials, TokimoAuthArgs};
use uuid::Uuid;

use crate::db::init_schema;
use crate::repos;
use crate::services;

// ── CLI subcommand enums ─────────────────────────────────────────────────────

#[derive(clap::Subcommand, Debug)]
pub enum AccountsCmd {
    /// 列出所有邮件账户
    List,
    /// 查看账户详情
    Get {
        /// 账户 ID
        id: Uuid,
    },
    /// 测试账户连接 (IMAP + SMTP)
    Test {
        /// 账户 ID
        id: Uuid,
    },
}

#[derive(clap::Subcommand, Debug)]
pub enum FoldersCmd {
    /// 列出账户的所有文件夹
    List,
    /// 从 IMAP 同步文件夹列表
    Sync,
}

#[derive(clap::Subcommand, Debug)]
pub enum MessagesCmd {
    /// 列出文件夹中的邮件
    List {
        /// 文件夹 ID
        folder_id: Uuid,
        /// 页码
        #[arg(long, default_value = "1")]
        page: u32,
        /// 每页数量
        #[arg(long, default_value = "50")]
        page_size: u32,
    },
    /// 读取邮件全文
    Read {
        /// 邮件 ID
        message_id: Uuid,
    },
    /// 标记为已读
    MarkRead {
        /// 邮件 ID（可多个）
        message_ids: Vec<Uuid>,
    },
    /// 标记为未读
    MarkUnread {
        /// 邮件 ID（可多个）
        message_ids: Vec<Uuid>,
    },
    /// 删除邮件
    Delete {
        /// 邮件 ID（可多个）
        message_ids: Vec<Uuid>,
    },
    /// 移动邮件到其他文件夹
    Move {
        /// 邮件 ID（可多个）
        message_ids: Vec<Uuid>,
        /// 目标文件夹 ID
        #[arg(long)]
        target_folder: Uuid,
    },
}

// ── CLI runners ──────────────────────────────────────────────────────────────

pub async fn run_accounts(auth: TokimoAuthArgs, cmd: AccountsCmd) -> anyhow::Result<()> {
    let (db, user_id) = init(auth).await?;

    match cmd {
        AccountsCmd::List => {
            let accounts = repos::accounts::list_by_user(&db, user_id).await?;
            if accounts.is_empty() {
                println!("No mail accounts configured.");
                return Ok(());
            }
            println!("{:<36}  {:<30}  {:<10}  Enabled", "ID", "Email", "Provider");
            for a in &accounts {
                println!("{:<36}  {:<30}  {:<10}  {}", a.id, a.email, a.provider, a.is_enabled);
            }
        }
        AccountsCmd::Get { id } => {
            let account = repos::accounts::find_by_id_and_user(&db, id, user_id)
                .await?
                .ok_or_else(|| anyhow::anyhow!("account not found"))?;
            println!("ID:            {}", account.id);
            println!("Display Name:  {}", account.display_name);
            println!("Email:         {}", account.email);
            println!("Provider:      {}", account.provider);
            println!("IMAP:          {}:{}", account.imap_host, account.imap_port);
            println!("SMTP:          {}:{}", account.smtp_host, account.smtp_port);
            println!("Enabled:       {}", account.is_enabled);
            println!("Sync Interval: {}s", account.sync_interval);
            if let Some(last) = account.last_sync_at {
                println!("Last Sync:     {}", last.with_timezone(&Utc).to_rfc3339());
            }
        }
        AccountsCmd::Test { id } => {
            services::accounts::test_connection(&db, user_id, id).await?;
            println!("Connection test passed.");
        }
    }

    Ok(())
}

pub async fn run_folders(auth: TokimoAuthArgs, account_id: Uuid, cmd: FoldersCmd) -> anyhow::Result<()> {
    let (db, user_id) = init(auth).await?;

    match cmd {
        FoldersCmd::List => {
            let folders = services::folders::list_folders(&db, user_id, account_id).await?;
            if folders.is_empty() {
                println!("No folders found. Run `folders sync` first.");
                return Ok(());
            }
            println!("{:<24}  {:<10}  {:<6}  {:<6}", "Name", "Type", "Unread", "Total");
            for f in &folders {
                println!(
                    "{:<24}  {:<10}  {:<6}  {:<6}",
                    f.name, f.folder_type, f.unread_count, f.total_count
                );
            }
        }
        FoldersCmd::Sync => {
            let folders = services::folders::sync_folders(&db, user_id, account_id).await?;
            println!("Synced {} folders.", folders.len());
            for f in &folders {
                println!(
                    "  {} ({}) — {} unread, {} total",
                    f.name, f.folder_type, f.unread_count, f.total_count
                );
            }
        }
    }

    Ok(())
}

pub async fn run_messages(auth: TokimoAuthArgs, account_id: Uuid, cmd: MessagesCmd) -> anyhow::Result<()> {
    let (db, user_id) = init(auth).await?;

    match cmd {
        MessagesCmd::List {
            folder_id,
            page,
            page_size,
        } => {
            let result =
                services::messages::list_messages(&db, user_id, account_id, folder_id, page, page_size).await?;
            if result.messages.is_empty() {
                println!("No messages in this folder.");
                return Ok(());
            }
            println!("{:<36}  {:<24}  {:<6}  {:<40}  Subject", "ID", "Date", "Read", "From");
            for m in &result.messages {
                let from = m.from.first().map(|a| a.address.as_str()).unwrap_or("(no sender)");
                let date = m.date.as_deref().unwrap_or("-");
                let read = if m.is_read { "Y" } else { "N" };
                let subj: String = m.subject.chars().take(40).collect();
                println!("{:<36}  {:<24}  {:<6}  {:<40}  {}", m.id, date, read, from, subj);
            }
            println!("\nTotal: {} messages (page {page})", result.total);
        }
        MessagesCmd::Read { message_id } => {
            let msg = services::messages::get_message(&db, user_id, message_id).await?;
            println!("From:    {}", format_addrs(&msg.from));
            println!("To:      {}", format_addrs(&msg.to));
            if !msg.cc.is_empty() {
                println!("CC:      {}", format_addrs(&msg.cc));
            }
            println!("Date:    {}", msg.date.as_deref().unwrap_or("-"));
            println!("Subject: {}", msg.subject);
            println!();
            if let Some(ref text) = msg.text_body {
                println!("{text}");
            } else if let Some(ref html) = msg.html_body {
                println!("[HTML body, {} chars]", html.len());
            } else {
                println!("[No body content]");
            }
            if !msg.attachments.is_empty() {
                println!("\nAttachments:");
                for a in &msg.attachments {
                    println!("  {} ({}, {} bytes)", a.filename, a.content_type, a.size);
                }
            }
        }
        MessagesCmd::MarkRead { message_ids } => {
            let ids: Vec<String> = message_ids.iter().map(|id| id.to_string()).collect();
            services::messages::mark_read(&db, user_id, &ids).await?;
            println!("Marked {} message(s) as read.", ids.len());
        }
        MessagesCmd::MarkUnread { message_ids } => {
            let ids: Vec<String> = message_ids.iter().map(|id| id.to_string()).collect();
            services::messages::mark_unread(&db, user_id, &ids).await?;
            println!("Marked {} message(s) as unread.", ids.len());
        }
        MessagesCmd::Delete { message_ids } => {
            let ids: Vec<String> = message_ids.iter().map(|id| id.to_string()).collect();
            services::messages::delete_messages(&db, user_id, &ids).await?;
            println!("Deleted {} message(s).", ids.len());
        }
        MessagesCmd::Move {
            message_ids,
            target_folder,
        } => {
            let ids: Vec<String> = message_ids.iter().map(|id| id.to_string()).collect();
            services::messages::move_messages(&db, user_id, &ids, &target_folder.to_string()).await?;
            println!("Moved {} message(s) to folder {target_folder}.", ids.len());
        }
    }

    Ok(())
}

pub async fn run_send(
    auth: TokimoAuthArgs,
    account_id: Uuid,
    to: Vec<String>,
    cc: Vec<String>,
    subject: String,
    body: String,
    html: Option<String>,
    in_reply_to: Option<String>,
) -> anyhow::Result<()> {
    let (db, user_id) = init(auth).await?;

    let body = crate::handlers::messages::SendMessageBody {
        to,
        cc: if cc.is_empty() { None } else { Some(cc) },
        bcc: None,
        subject,
        text_body: Some(body),
        html_body: html,
        in_reply_to,
        references: None,
    };

    services::messages::send_message(&db, user_id, account_id, body, vec![]).await?;
    println!("Email sent successfully.");
    Ok(())
}

pub async fn run_sync(auth: TokimoAuthArgs, account_id: Uuid) -> anyhow::Result<()> {
    let (db, user_id) = init(auth).await?;

    let account = repos::accounts::find_by_id_and_user(&db, account_id, user_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("account not found"))?;

    println!("Syncing account {} ({account_id})...", account.email);

    services::sync::sync_account(&db, user_id, account_id, None).await?;

    let folders = repos::folders::list_by_account(&db, account_id).await?;
    for f in &folders {
        println!(
            "  {}: {} unread, {} total",
            crate::services::folders::display_folder_name(&f.name, f.delimiter.as_deref()),
            f.unread_count,
            f.total_count
        );
    }

    println!("Sync complete.");
    Ok(())
}

pub async fn run_search(
    auth: TokimoAuthArgs,
    account_id: Uuid,
    query: String,
    _folder_id: Option<Uuid>,
) -> anyhow::Result<()> {
    let (db, user_id) = init(auth).await?;

    let result = services::messages::search_messages(&db, user_id, account_id, &query).await?;
    if result.messages.is_empty() {
        println!("No messages matching '{query}'.");
        return Ok(());
    }

    println!("{:<36}  {:<24}  {:<40}  Subject", "ID", "Date", "From");
    for m in &result.messages {
        let from = m.from.first().map(|a| a.address.as_str()).unwrap_or("(no sender)");
        let date = m.date.as_deref().unwrap_or("-");
        let subj: String = m.subject.chars().take(40).collect();
        println!("{:<36}  {:<24}  {:<40}  {}", m.id, date, from, subj);
    }
    println!("\nFound {} message(s).", result.total);

    Ok(())
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async fn init(auth: TokimoAuthArgs) -> anyhow::Result<(DatabaseConnection, Uuid)> {
    let credentials = Credentials::resolve(&auth).context("resolve Tokimo credentials failed")?;
    let db = connect_db().await.context("connect database failed")?;
    init_schema(&db).await.context("init schema failed")?;
    let verified = verify_token(&db, &credentials.token)
        .await
        .context("verify Tokimo token failed")?;
    Ok((db, verified.user_id))
}

fn format_addrs(addrs: &[crate::handlers::messages::MailAddressOutput]) -> String {
    addrs
        .iter()
        .map(|a| {
            if let Some(ref name) = a.name {
                format!("{name} <{}>", a.address)
            } else {
                a.address.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}
