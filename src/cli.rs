//! CLI entrypoints for mail app.

use std::path::PathBuf;

use anyhow::Context;
use base64::Engine;
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
        /// 账户 ID 或邮箱地址
        #[arg(long)]
        id: String,
    },
    /// 测试账户连接 (IMAP + SMTP)
    Test {
        /// 账户 ID 或邮箱地址
        #[arg(long)]
        id: String,
    },
    /// 删除邮件账户
    Delete {
        /// 账户 ID 或邮箱地址
        #[arg(long)]
        id: String,
    },
    /// 添加邮件账户
    Add {
        /// 邮箱地址
        #[arg(long)]
        email: String,
        /// 密码（或应用密码）
        #[arg(long)]
        password: String,
        /// 显示名称
        #[arg(long, default_value = "")]
        name: String,
        /// IMAP 主机（不传则自动检测）
        #[arg(long)]
        imap_host: Option<String>,
        /// IMAP 端口
        #[arg(long, default_value = "993")]
        imap_port: u16,
        /// SMTP 主机（不传则自动检测）
        #[arg(long)]
        smtp_host: Option<String>,
        /// SMTP 端口
        #[arg(long, default_value = "465")]
        smtp_port: u16,
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
    /// 列出文件夹中的邮件（默认 INBOX）
    List {
        /// 文件夹 ID（不传则使用 INBOX）
        folder_id: Option<Uuid>,
        /// 页码
        #[arg(long, default_value = "1")]
        page: u32,
        /// 每页数量
        #[arg(long, default_value = "50")]
        page_size: u32,
    },
    /// 读取邮件全文
    Read {
        /// 邮件 ID（`messages list` 输出的第一列）
        message_id: String,
    },
    /// 标记为已读
    MarkRead {
        /// 邮件 ID（可多个）
        message_ids: Vec<String>,
    },
    /// 标记为未读
    MarkUnread {
        /// 邮件 ID（可多个）
        message_ids: Vec<String>,
    },
    /// 删除邮件
    Delete {
        /// 邮件 ID（可多个）
        message_ids: Vec<String>,
    },
    /// 移动邮件到其他文件夹
    Move {
        /// 邮件 ID（可多个）
        message_ids: Vec<String>,
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
            let id = resolve_account(&db, user_id, &id).await?;
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
            let id = resolve_account(&db, user_id, &id).await?;
            services::accounts::test_connection(&db, user_id, id).await?;
            println!("Connection test passed.");
        }
        AccountsCmd::Delete { id } => {
            let id = resolve_account(&db, user_id, &id).await?;
            services::accounts::delete_account(&db, user_id, id).await?;
            println!("Account {id} deleted.");
        }
        AccountsCmd::Add {
            email,
            password,
            name,
            imap_host,
            imap_port,
            smtp_host,
            smtp_port,
        } => {
            // Auto-detect provider or use provided hosts.
            let (imap_h, smtp_h, provider) = if let (Some(ih), Some(sh)) = (&imap_host, &smtp_host) {
                (ih.clone(), sh.clone(), "custom".to_string())
            } else if let Some(preset) = tokimo_mail::provider::detect_provider(&email) {
                (preset.imap_host, preset.smtp_host, format!("{:?}", preset.provider).to_lowercase())
            } else {
                anyhow::bail!("Cannot auto-detect provider for '{}'. Use --imap-host and --smtp-host.", email);
            };

            let display_name = if name.is_empty() {
                email.clone()
            } else {
                name
            };

            let body = crate::handlers::accounts::CreateAccountBody {
                display_name,
                email: email.clone(),
                provider: Some(provider),
                imap_host: imap_h,
                imap_port: Some(imap_port as i32),
                imap_security: Some("tls".into()),
                imap_username: email.clone(),
                imap_password: password.clone(),
                smtp_host: smtp_h,
                smtp_port: Some(smtp_port as i32),
                smtp_security: Some("tls".into()),
                smtp_username: email,
                smtp_password: password,
                sender_name: None,
                sync_interval: Some(300),
            };

            let account = services::accounts::create_account(&db, user_id, body).await?;
            println!("Account created: {} ({})", account.email, account.id);
        }
    }

    Ok(())
}

pub async fn run_folders(auth: TokimoAuthArgs, account: String, cmd: FoldersCmd) -> anyhow::Result<()> {
    let (db, user_id) = init(auth).await?;
    let account_id = resolve_account(&db, user_id, &account).await?;

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

pub async fn run_messages(auth: TokimoAuthArgs, account: String, cmd: MessagesCmd) -> anyhow::Result<()> {
    let (db, user_id) = init(auth).await?;
    let account_id = resolve_account(&db, user_id, &account).await?;

    match cmd {
        MessagesCmd::List {
            folder_id,
            page,
            page_size,
        } => {
            // Default to INBOX if no folder_id specified.
            let folder_id = match folder_id {
                Some(id) => id,
                None => {
                    let folders = repos::folders::list_by_account(&db, account_id).await?;
                    folders
                        .iter()
                        .find(|f| f.folder_type == "inbox")
                        .map(|f| f.id)
                        .ok_or_else(|| anyhow::anyhow!("No INBOX folder found. Run `folders sync` first."))?
                }
            };

            // Page 1: forward-sync for new messages. Other pages: no sync.
            let (imap_total, db_total) = if page == 1 {
                services::sync::quick_sync_folder(&db, user_id, folder_id)
                    .await
                    .unwrap_or((0, 0))
            } else {
                let folder_total = repos::folders::find_by_id(&db, folder_id)
                    .await
                    .ok()
                    .flatten()
                    .map(|f| f.total_count.max(0) as u32)
                    .unwrap_or(0);
                let db_count = repos::messages::count_in_folder(&db, folder_id).await.unwrap_or(0) as u32;
                (folder_total, db_count)
            };

            let first_msg_offset = (page - 1) * page_size;

            // If the requested page is beyond DB range, fetch from IMAP and store to DB.
            if first_msg_offset >= db_total && imap_total > 0 {
                let messages = services::sync::list_page_from_imap(user_id, folder_id, page, page_size, &db).await?;
                if messages.is_empty() {
                    println!("No messages in this folder.");
                    return Ok(());
                }
                println!("{:<8}  {:<20}  {:<4}  {:<30}  Subject", "ID", "Date", "Read", "From");
                for m in &messages {
                    let from = parse_addrs_json(&m.from_addrs).into_iter().next().map(|a| a.address).unwrap_or_else(|| "(no sender)".into());
                    let date = m.date.map(|d| d.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M").to_string()).unwrap_or_else(|| "-".into());
                    let read = if m.is_read { "Y" } else { "N" };
                    println!("{:<8}  {:<20}  {:<4}  {:<30}  {}", m.id, date, read, from, m.subject);
                }
                let showing = format!("{}-{}", first_msg_offset + 1, first_msg_offset + messages.len() as u32);
                println!("\nShowing {showing} of {imap_total} messages (page {page})");
                return Ok(());
            }

            let result =
                services::messages::list_messages(&db, user_id, account_id, folder_id, page, page_size).await?;
            if result.messages.is_empty() {
                println!("No messages in this folder.");
                return Ok(());
            }
            println!("{:<8}  {:<20}  {:<4}  {:<30}  Subject", "ID", "Date", "Read", "From");
            for m in &result.messages {
                let from = m.from.first().map(|a| a.address.as_str()).unwrap_or("(no sender)");
                let date = m.date.as_deref().map(format_date_local).unwrap_or_else(|| "-".into());
                let read = if m.is_read { "Y" } else { "N" };
                println!("{:<8}  {:<20}  {:<4}  {:<30}  {}", m.id, date, read, from, m.subject);
            }
            let showing = format!("{}-{}", first_msg_offset + 1, first_msg_offset + result.messages.len() as u32);
            println!("\nShowing {showing} of {imap_total} messages (page {page})");
        }
        MessagesCmd::Read { message_id } => {
            let uuid = resolve_message_id(&db, account_id, &message_id, None).await?;
            let msg = services::messages::get_message(&db, user_id, uuid).await?;
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
            let uuids = resolve_message_ids(&db, account_id, &message_ids, None).await?;
            let ids: Vec<String> = uuids.iter().map(|id| id.to_string()).collect();
            services::messages::mark_read(&db, user_id, &ids).await?;
            println!("Marked {} message(s) as read.", ids.len());
        }
        MessagesCmd::MarkUnread { message_ids } => {
            let uuids = resolve_message_ids(&db, account_id, &message_ids, None).await?;
            let ids: Vec<String> = uuids.iter().map(|id| id.to_string()).collect();
            services::messages::mark_unread(&db, user_id, &ids).await?;
            println!("Marked {} message(s) as unread.", ids.len());
        }
        MessagesCmd::Delete { message_ids } => {
            let uuids = resolve_message_ids(&db, account_id, &message_ids, None).await?;
            let ids: Vec<String> = uuids.iter().map(|id| id.to_string()).collect();
            services::messages::delete_messages(&db, user_id, &ids).await?;
            println!("Deleted {} message(s).", ids.len());
        }
        MessagesCmd::Move {
            message_ids,
            target_folder,
        } => {
            let uuids = resolve_message_ids(&db, account_id, &message_ids, None).await?;
            let ids: Vec<String> = uuids.iter().map(|id| id.to_string()).collect();
            services::messages::move_messages(&db, user_id, &ids, &target_folder.to_string()).await?;
            println!("Moved {} message(s) to folder {target_folder}.", ids.len());
        }
    }

    Ok(())
}

pub async fn run_send(
    auth: TokimoAuthArgs,
    account: String,
    to: Vec<String>,
    cc: Vec<String>,
    subject: String,
    body: String,
    html: Option<String>,
    in_reply_to: Option<String>,
    attachment_paths: Vec<PathBuf>,
) -> anyhow::Result<()> {
    let (db, user_id) = init(auth).await?;
    let account_id = resolve_account(&db, user_id, &account).await?;

    let mut attachments = Vec::new();
    for path in &attachment_paths {
        let data = std::fs::read(path)
            .with_context(|| format!("failed to read attachment: {}", path.display()))?;
        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "attachment".into());
        let content_type = mime_guess::from_path(path)
            .first_or_octet_stream()
            .to_string();
        attachments.push(tokimo_mail::message::ComposeAttachment {
            filename,
            content_type,
            data: base64::engine::general_purpose::STANDARD.encode(&data),
        });
    }

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

    let count = attachments.len();
    services::messages::send_message(&db, user_id, account_id, body, attachments).await?;
    if count > 0 {
        println!("Email sent successfully with {count} attachment(s).");
    } else {
        println!("Email sent successfully.");
    }
    Ok(())
}

pub async fn run_sync(auth: TokimoAuthArgs, account: String) -> anyhow::Result<()> {
    let (db, user_id) = init(auth).await?;
    let account_id = resolve_account(&db, user_id, &account).await?;

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
    account: String,
    query: String,
    _folder_id: Option<Uuid>,
) -> anyhow::Result<()> {
    let (db, user_id) = init(auth).await?;
    let account_id = resolve_account(&db, user_id, &account).await?;

    // Quick forward-sync INBOX so search reflects latest IMAP state.
    if let Ok(folders) = repos::folders::list_by_account(&db, account_id).await {
        if let Some(inbox) = folders.iter().find(|f| f.folder_type == "inbox") {
            let _ = services::sync::quick_sync_folder(&db, user_id, inbox.id).await;
        }
    }

    let result = services::messages::search_messages(&db, user_id, account_id, &query).await?;
    if result.messages.is_empty() {
        println!("No messages matching '{query}'.");
        return Ok(());
    }

    println!("{:<8}  {:<20}  {:<30}  Subject", "UID", "Date", "From");
    for m in &result.messages {
        let from = m.from.first().map(|a| a.address.as_str()).unwrap_or("(no sender)");
        let date = m.date.as_deref().map(format_date_local).unwrap_or_else(|| "-".into());
        println!("{:<8}  {:<20}  {:<30}  {}", m.uid, date, from, m.subject);
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

/// Resolve an account identifier (UUID or email address) to a UUID.
async fn resolve_account(db: &DatabaseConnection, user_id: Uuid, account: &str) -> anyhow::Result<Uuid> {
    // Try UUID first.
    if let Ok(id) = account.parse::<Uuid>() {
        if repos::accounts::find_by_id_and_user(db, id, user_id).await?.is_some() {
            return Ok(id);
        }
    }
    // Fall back to email lookup.
    if let Some(a) = repos::accounts::find_by_email_and_user(db, account, user_id).await? {
        return Ok(a.id);
    }
    anyhow::bail!("Account '{account}' not found. Run `accounts list` to see available accounts.");
}

/// Resolve a database message PK.
async fn resolve_message_id(
    db: &DatabaseConnection,
    _account_id: Uuid,
    raw: &str,
    _folder_id: Option<Uuid>,
) -> anyhow::Result<i32> {
    let id: i32 = raw
        .parse()
        .map_err(|_| anyhow::anyhow!("'{raw}' is not a valid message ID"))?;

    repos::messages::find_by_id(db, id)
        .await?
        .map(|m| m.id)
        .ok_or_else(|| anyhow::anyhow!("No message with ID {id} found"))
}

/// Resolve multiple message identifiers to i32 IDs.
async fn resolve_message_ids(
    db: &DatabaseConnection,
    account_id: Uuid,
    raws: &[String],
    folder_id: Option<Uuid>,
) -> anyhow::Result<Vec<i32>> {
    let mut ids = Vec::with_capacity(raws.len());
    for raw in raws {
        ids.push(resolve_message_id(db, account_id, raw, folder_id).await?);
    }
    Ok(ids)
}

/// Format an RFC 3339 date string in local timezone (compact: "YYYY-MM-DD HH:MM").
fn format_date_local(date_str: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(date_str)
        .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_else(|_| date_str.get(..16).unwrap_or(date_str).replace('T', " "))
}

fn parse_addrs_json(json: &serde_json::Value) -> Vec<crate::handlers::messages::MailAddressOutput> {
    serde_json::from_value(json.clone()).unwrap_or_default()
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
