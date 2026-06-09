-- mail app initial schema
-- Host migrator runs each statement under SET LOCAL search_path = "<schema>",public
-- so all table/index identifiers stay unqualified.

CREATE TABLE IF NOT EXISTS mail_accounts (
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
);

CREATE TABLE IF NOT EXISTS mail_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
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
);

CREATE TABLE IF NOT EXISTS mail_messages (
    id SERIAL PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES mail_folders(id) ON DELETE CASCADE,
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
);

CREATE TABLE IF NOT EXISTS mail_attachments (
    id SERIAL PRIMARY KEY,
    message_id INT NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INT NOT NULL DEFAULT 0,
    data TEXT
);

CREATE INDEX IF NOT EXISTS mail_accounts_user_id_idx ON mail_accounts (user_id);
CREATE INDEX IF NOT EXISTS mail_folders_account_id_idx ON mail_folders (account_id);
CREATE INDEX IF NOT EXISTS mail_messages_account_folder_idx ON mail_messages (account_id, folder_id);
CREATE INDEX IF NOT EXISTS mail_messages_account_date_idx ON mail_messages (account_id, date);
CREATE INDEX IF NOT EXISTS mail_messages_message_id_idx ON mail_messages (message_id);
CREATE INDEX IF NOT EXISTS mail_messages_is_read_idx ON mail_messages (is_read);
CREATE INDEX IF NOT EXISTS mail_attachments_message_id_idx ON mail_attachments (message_id);
