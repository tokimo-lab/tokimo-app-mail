//! Tokimo Mail App — 多进程架构：CLI / Server 双模二进制。

mod app_server;
mod assets;
mod cli;
mod ctx;
mod db;
mod error;
mod handlers; // also pub via lib.rs for ts-rs
mod repos;
mod scheduler;
mod services;

use std::sync::{Arc, OnceLock};

use std::path::PathBuf;

use clap::{Parser, Subcommand};
use tokimo_bus_cli::TokimoAuthArgs;
use tokimo_bus_client::{BusClient, ClientConfig};
use tracing::{error, info};
use uuid::Uuid;

#[derive(Parser, Debug)]
#[command(
    name = "tokimo-app-mail",
    about = "Mail — Tokimo 邮件 CLI",
    long_about = "Tokimo Mail CLI — 管理邮件账户、文件夹、发送和接收邮件。\n\n前置条件：\n1. 在浏览器登录 Tokimo 后，去「设置 → API Keys」创建一个 token (mm_xxx)\n2. 把 token 通过 --tokimo-token 或 TOKIMO_TOKEN env 传入\n3. 确保 DATABASE_URL env 指向 Tokimo 数据库（与主 server 一致）\n\nCLI 直接读写数据库，不依赖主 server 进程运行。",
    term_width = 100
)]
struct Cli {
    #[command(flatten)]
    auth: TokimoAuthArgs,
    /// 账户 ID 或邮箱地址
    #[arg(long, global = true)]
    account: Option<String>,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// 管理邮件账户
    #[command(subcommand_required = false, arg_required_else_help = false)]
    Accounts {
        #[command(subcommand)]
        cmd: Option<cli::AccountsCmd>,
    },
    /// 管理文件夹
    Folders {
        #[command(subcommand)]
        cmd: cli::FoldersCmd,
    },
    /// 管理邮件
    Messages {
        #[command(subcommand)]
        cmd: cli::MessagesCmd,
    },
    /// 发送邮件
    Send {
        /// 收件人（可多个）
        #[arg(long)]
        to: Vec<String>,
        /// 抄送（可多个）
        #[arg(long)]
        cc: Vec<String>,
        /// 主题
        #[arg(long)]
        subject: String,
        /// 正文（纯文本）
        #[arg(long)]
        body: String,
        /// HTML 正文
        #[arg(long)]
        html: Option<String>,
        /// 回复的 Message-ID
        #[arg(long)]
        in_reply_to: Option<String>,
        /// 附件文件路径（可多个）
        #[arg(long)]
        attachment: Vec<PathBuf>,
    },
    /// 同步账户邮件（文件夹 + 邮件）
    Sync,
    /// 搜索邮件
    Search {
        /// 搜索关键词
        query: String,
        /// 限定文件夹 ID
        #[arg(long)]
        folder_id: Option<Uuid>,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let Cli { auth, account, command } = Cli::parse();

    match command {
        None if std::env::var_os("TOKIMO_BUS_SOCKET").is_some() => {
            tracing_subscriber::fmt()
                .with_env_filter(
                    tracing_subscriber::EnvFilter::try_from_default_env()
                        .unwrap_or_else(|_| "info,tokimo_bus_client=info,tokimo_app_mail=debug".into()),
                )
                .init();
            if let Err(error) = run_server().await {
                error!(%error, "mail: fatal");
                std::process::exit(1);
            }
        }
        None => {
            use clap::CommandFactory;
            let mut cmd = Cli::command();
            tokimo_bus_cli::print_help_unified(&mut cmd);
            std::process::exit(0);
        }
        Some(cmd) => {
            let require_account = || -> anyhow::Result<String> {
                account.ok_or_else(|| anyhow::anyhow!("--account is required (account ID or email address)"))
            };
            let result = match cmd {
                Command::Accounts { cmd: None } => {
                    use clap::CommandFactory;
                    let mut root = Cli::command();
                    root.build();
                    if let Some(accounts_cmd) = root.find_subcommand_mut("accounts") {
                        tokimo_bus_cli::print_help_unified(accounts_cmd);
                    }
                    std::process::exit(0);
                }
                Command::Accounts { cmd: Some(c) } => cli::run_accounts(auth, c).await,
                Command::Folders { cmd } => cli::run_folders(auth, require_account()?, cmd).await,
                Command::Messages { cmd } => cli::run_messages(auth, require_account()?, cmd).await,
                Command::Send {
                    to,
                    cc,
                    subject,
                    body,
                    html,
                    in_reply_to,
                    attachment,
                } => {
                    cli::run_send(
                        auth,
                        require_account()?,
                        to,
                        cc,
                        subject,
                        body,
                        html,
                        in_reply_to,
                        attachment,
                    )
                    .await
                }
                Command::Sync => cli::run_sync(auth, require_account()?).await,
                Command::Search { query, folder_id } => {
                    cli::run_search(auth, require_account()?, query, folder_id).await
                }
            };
            if let Err(error) = result {
                eprintln!("Error: {error:#}");
                std::process::exit(1);
            }
        }
    }

    Ok(())
}

async fn run_server() -> anyhow::Result<()> {
    let cfg = ClientConfig::from_env().map_err(|e| anyhow::anyhow!("ClientConfig: {e}"))?;
    info!(endpoint = ?cfg.endpoint, "mail: connecting to broker");

    let db = db::init_pool().await?;
    info!("mail: db connected (schema managed by host)");

    let client_slot: Arc<OnceLock<Arc<BusClient>>> = Arc::new(OnceLock::new());
    let context = Arc::new(ctx::AppCtx {
        db: db.clone(),
        client: Arc::clone(&client_slot),
    });

    let app_socket = app_server::spawn("mail", Arc::clone(&context))
        .await
        .map_err(|e| anyhow::anyhow!("app_server spawn: {e}"))?;

    let client = BusClient::builder(cfg)
        .service("mail", env!("CARGO_PKG_VERSION"))
        .data_plane(app_socket)
        .build()
        .await
        .map_err(|e| anyhow::anyhow!("bus build: {e}"))?;
    client_slot
        .set(Arc::clone(&client))
        .map_err(|_| anyhow::anyhow!("client_slot already set"))?;

    info!("mail: registered with broker");

    // Start background scheduler (sync, body fetch, IDLE).
    scheduler::start(db);

    let shutdown = {
        let client = Arc::clone(&client);
        tokio::spawn(async move { client.run_until_shutdown().await })
    };

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("mail: SIGINT received");
            client.shutdown();
        }
        _ = shutdown => info!("mail: broker sent Shutdown"),
    }

    Ok(())
}
