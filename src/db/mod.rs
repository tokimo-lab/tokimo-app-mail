//! DB 层 — 连接池初始化 + PG schema DDL。

pub mod entities;

use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseBackend, DatabaseConnection, Statement};

const SCHEMA: &str = "mail";

pub async fn init_pool() -> anyhow::Result<DatabaseConnection> {
    let base_url = std::env::var("DATABASE_URL").map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?;

    let sep = if base_url.contains('?') { '&' } else { '?' };
    let url = format!("{base_url}{sep}application_name=tokimo-app-mail");

    let mut opts = ConnectOptions::new(url);
    opts.max_connections(4).min_connections(1).sqlx_logging(false);

    Ok(Database::connect(opts).await?)
}

pub async fn init_schema(db: &DatabaseConnection) -> anyhow::Result<()> {
    let ddl = [
        format!(r#"CREATE SCHEMA IF NOT EXISTS "{SCHEMA}""#),
        // mail_accounts
        format!(
            r#"CREATE TABLE IF NOT EXISTS "{SCHEMA}".mail_accounts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL,
                display_name TEXT NOT NULL,
                email TEXT NOT NULL,
                provider TEXT NOT NULL DEFAULT 'custom',
                imap_host TEXT NOT NULL,
                imap_port INT NOT NULL DEFAULT 993,
                imap_security TEXT NOT NULL DEFAULT 'tls',
                imap_username TEXT NOT NULL,
                imap_password TEXT NOT NULL,
                smtp_host TEXT NOT NULL,
                smtp_port INT NOT NULL DEFAULT 465,
                smtp_security TEXT NOT NULL DEFAULT 'tls',
                smtp_username TEXT NOT NULL,
                smtp_password TEXT NOT NULL,
                sender_name TEXT,
                is_enabled BOOLEAN NOT NULL DEFAULT true,
                sync_interval INT NOT NULL DEFAULT 300,
                last_sync_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(user_id, email)
            )"#
        ),
        // mail_folders
        format!(
            r#"CREATE TABLE IF NOT EXISTS "{SCHEMA}".mail_folders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                account_id UUID NOT NULL REFERENCES "{SCHEMA}".mail_accounts(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                delimiter TEXT,
                folder_type TEXT NOT NULL DEFAULT 'custom',
                attributes JSONB,
                total_count INT NOT NULL DEFAULT 0,
                unread_count INT NOT NULL DEFAULT 0,
                uid_validity INT,
                uid_next INT,
                sort_order INT NOT NULL DEFAULT 0,
                history_sync_cursor INT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(account_id, name)
            )"#
        ),
        // mail_messages
        format!(
            r#"CREATE TABLE IF NOT EXISTS "{SCHEMA}".mail_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                account_id UUID NOT NULL REFERENCES "{SCHEMA}".mail_accounts(id) ON DELETE CASCADE,
                folder_id UUID NOT NULL REFERENCES "{SCHEMA}".mail_folders(id) ON DELETE CASCADE,
                uid INT NOT NULL,
                message_id TEXT,
                subject TEXT NOT NULL DEFAULT '',
                from_addrs JSONB NOT NULL,
                to_addrs JSONB NOT NULL,
                cc_addrs JSONB,
                bcc_addrs JSONB,
                reply_to_addrs JSONB,
                in_reply_to TEXT,
                refs TEXT,
                date TIMESTAMPTZ,
                text_body TEXT,
                html_body TEXT,
                preview TEXT NOT NULL DEFAULT '',
                flags JSONB NOT NULL DEFAULT '[]',
                is_read BOOLEAN NOT NULL DEFAULT false,
                is_flagged BOOLEAN NOT NULL DEFAULT false,
                has_attachments BOOLEAN NOT NULL DEFAULT false,
                size INT NOT NULL DEFAULT 0,
                body_fetched BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(account_id, folder_id, uid)
            )"#
        ),
        // mail_attachments
        format!(
            r#"CREATE TABLE IF NOT EXISTS "{SCHEMA}".mail_attachments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                message_id UUID NOT NULL REFERENCES "{SCHEMA}".mail_messages(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size INT NOT NULL DEFAULT 0,
                data TEXT
            )"#
        ),
        // indexes
        format!(r#"CREATE INDEX IF NOT EXISTS mail_accounts_user_id_idx ON "{SCHEMA}".mail_accounts (user_id)"#),
        format!(r#"CREATE INDEX IF NOT EXISTS mail_folders_account_id_idx ON "{SCHEMA}".mail_folders (account_id)"#),
        format!(
            r#"CREATE INDEX IF NOT EXISTS mail_messages_account_folder_idx ON "{SCHEMA}".mail_messages (account_id, folder_id)"#
        ),
        format!(
            r#"CREATE INDEX IF NOT EXISTS mail_messages_account_date_idx ON "{SCHEMA}".mail_messages (account_id, date)"#
        ),
        format!(r#"CREATE INDEX IF NOT EXISTS mail_messages_message_id_idx ON "{SCHEMA}".mail_messages (message_id)"#),
        format!(r#"CREATE INDEX IF NOT EXISTS mail_messages_is_read_idx ON "{SCHEMA}".mail_messages (is_read)"#),
        format!(
            r#"CREATE INDEX IF NOT EXISTS mail_attachments_message_id_idx ON "{SCHEMA}".mail_attachments (message_id)"#
        ),
    ];

    for sql in ddl {
        db.execute_raw(Statement::from_string(DatabaseBackend::Postgres, sql))
            .await?;
    }

    Ok(())
}
