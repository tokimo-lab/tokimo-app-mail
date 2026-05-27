use std::sync::Arc;

use chrono::Utc;
use sea_orm::*;
use tokimo_bus_client::BusClient;
use tokimo_bus_protocol::CallerCtx;
use tracing::{debug, info, warn};
use uuid::Uuid;

use super::accounts::account_to_config;
use crate::db::entities::{mail_accounts, mail_folders, mail_messages};
use crate::error::AppError;
use crate::repos;

/// Event broadcaster trait — fires entity events via the OS bus.
pub trait EventBroadcaster: Send + Sync + 'static {
    fn broadcast_new_messages(&self, user_id: Uuid, account_id: &str, folder_id: &str, count: usize);
    fn broadcast_flags_synced(&self, user_id: Uuid, account_id: &str, folder_id: &str, read_uids: Vec<i32>, unread_uids: Vec<i32>);
    fn broadcast_folder_counts(&self, user_id: Uuid, account_id: &str, folders: Vec<(String, i64)>);
    fn clone_box(&self) -> Box<dyn EventBroadcaster>;
}

/// No-op broadcaster for CLI mode.
pub struct NoopBroadcaster;
impl EventBroadcaster for NoopBroadcaster {
    fn broadcast_new_messages(&self, _: Uuid, _: &str, _: &str, _: usize) {}
    fn broadcast_flags_synced(&self, _: Uuid, _: &str, _: &str, _: Vec<i32>, _: Vec<i32>) {}
    fn broadcast_folder_counts(&self, _: Uuid, _: &str, _: Vec<(String, i64)>) {}
    fn clone_box(&self) -> Box<dyn EventBroadcaster> {
        Box::new(NoopBroadcaster)
    }
}

/// Live broadcaster — forwards events to the OS via `app_events.emit`.
pub struct BusBroadcaster {
    client: Arc<BusClient>,
}

impl BusBroadcaster {
    pub fn new(client: Arc<BusClient>) -> Self {
        Self { client }
    }

    fn emit(&self, user_id: Uuid, kind: &'static str, scope: String, payload: serde_json::Value) {
        let client = Arc::clone(&self.client);
        let user_id_str = user_id.to_string();
        tokio::spawn(async move {
            let body = serde_json::json!({
                "kind": kind,
                "scope": scope,
                "payload": payload,
            })
            .to_string()
            .into_bytes();
            let caller = CallerCtx {
                caller_app_id: Some("mail".into()),
                user_id: Some(user_id_str),
                ..Default::default()
            };
            if let Err(e) = client.invoke("app_events", "emit", body, caller).await {
                warn!("mail: app_events.emit({kind}) failed: {e}");
            }
        });
    }
}

impl EventBroadcaster for BusBroadcaster {
    fn broadcast_new_messages(&self, user_id: Uuid, account_id: &str, folder_id: &str, count: usize) {
        let payload = serde_json::json!({
            "accountId": account_id,
            "folderId": folder_id,
            "count": count,
        });
        self.emit(user_id, "new_messages", format!("account:{account_id}"), payload);
    }

    fn broadcast_flags_synced(
        &self,
        user_id: Uuid,
        account_id: &str,
        folder_id: &str,
        read_uids: Vec<i32>,
        unread_uids: Vec<i32>,
    ) {
        let payload = serde_json::json!({
            "accountId": account_id,
            "folderId": folder_id,
            "readUids": read_uids,
            "unreadUids": unread_uids,
        });
        self.emit(user_id, "flags_synced", format!("account:{account_id}"), payload);
    }

    fn broadcast_folder_counts(&self, user_id: Uuid, account_id: &str, folders: Vec<(String, i64)>) {
        let folders_json: Vec<serde_json::Value> = folders
            .iter()
            .map(|(id, count)| serde_json::json!({"folderId": id, "unreadCount": count}))
            .collect();
        let payload = serde_json::json!({
            "accountId": account_id,
            "folders": folders_json,
        });
        self.emit(user_id, "folder_counts", format!("account:{account_id}"), payload);
    }

    fn clone_box(&self) -> Box<dyn EventBroadcaster> {
        Box::new(BusBroadcaster { client: Arc::clone(&self.client) })
    }
}

pub async fn sync_account(
    db: &DatabaseConnection,
    user_id: Uuid,
    account_id: Uuid,
    event_tx: Option<&dyn EventBroadcaster>,
) -> Result<(), AppError> {
    let account = repos::accounts::find_by_id_and_user(db, account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Account not found".into()))?;

    info!("Starting mail sync for account: {} ({})", account.email, account.id);

    let cfg = account_to_config(&account);
    let client = tokimo_package_mail::MailClient::new(cfg.clone());

    // 1. Sync folders first.
    let remote_folders = client
        .list_folders_with_counts()
        .await
        .map_err(|e| AppError::Internal(format!("IMAP list folders: {e}")))?;

    let mut db_folders = Vec::new();
    for rf in &remote_folders {
        let folder_type = detect_folder_type(&rf.name, &rf.attributes);
        let sort_order = folder_sort_order(&folder_type);
        let model = repos::folders::upsert(
            db,
            account_id,
            &rf.name,
            rf.delimiter.as_deref(),
            &folder_type,
            &rf.attributes,
            rf.total.unwrap_or(0) as i32,
            rf.unseen.unwrap_or(0) as i32,
            sort_order,
        )
        .await?;
        db_folders.push(model);
    }

    // 2. Sync messages for each folder.
    for folder in &db_folders {
        if let Err(e) = sync_folder_messages(db, &cfg, account_id, user_id, folder, event_tx).await {
            warn!("Failed to sync folder '{}' for {}: {e}", folder.name, account.email);
        }
    }

    // 3. Update last_sync_at.
    let mut active: mail_accounts::ActiveModel = account.into();
    active.last_sync_at = Set(Some(Utc::now().fixed_offset()));
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(db).await?;
    info!("Mail sync completed for account_id={account_id}");
    Ok(())
}

/// Quick forward-sync a single folder — only fetches new messages since max_uid.
/// Skips history backfill / reconcile / flag sync. Suitable for CLI pre-list sync.
/// Returns (imap_total, db_total) so the caller can detect gaps.
pub async fn quick_sync_folder(
    db: &DatabaseConnection,
    user_id: Uuid,
    folder_id: Uuid,
) -> Result<(u32, u32), AppError> {
    let folder = repos::folders::find_by_id(db, folder_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Folder not found".into()))?;

    let account = repos::accounts::find_by_id_and_user(db, folder.account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Account not found".into()))?;

    let cfg = account_to_config(&account);
    let mut imap = tokimo_package_mail::MailSession::connect(&cfg)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP connect: {e}")))?;

    let (total, _unseen, _uid_validity) = imap
        .open_folder_ex(&folder.name)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP SELECT '{}': {e}", folder.name)))?;

    let max_uid = repos::messages::max_uid_in_folder(db, account.id, folder.id).await?;

    if let Some(max_uid) = max_uid {
        if total > 0 {
            let uid_range = format!("{}:*", max_uid + 1);
            if let Ok(summaries) = imap.fetch_summaries_by_uids(&uid_range).await {
                store_summaries_batch(db, account.id, &folder, &summaries).await?;
            }
        }
    } else if total > 0 {
        // First time — grab the latest 200.
        let start = total.saturating_sub(199);
        let seq_range = format!("{start}:{total}");
        if let Ok(summaries) = imap.fetch_summaries_by_seq(&seq_range).await {
            store_summaries_batch(db, account.id, &folder, &summaries).await?;
        }
    }

    imap.logout().await;

    // Update unread count.
    let unread = repos::messages::count_unread(db, folder.id).await?;
    let db_total = repos::messages::count_in_folder(db, folder.id).await? as u32;
    let mut active: mail_folders::ActiveModel = folder.into();
    active.total_count = Set(total as i32);
    active.unread_count = Set(unread as i32);
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(db).await?;

    Ok((total, db_total))
}

/// Fetch a specific page of messages directly from IMAP (sequence-based).
/// Returns summaries for the requested page without touching the DB.
/// Used when the requested page is beyond what the DB has cached.
pub async fn list_page_from_imap(
    user_id: Uuid,
    folder_id: Uuid,
    page: u32,
    page_size: u32,
    db: &DatabaseConnection,
) -> Result<Vec<mail_messages::Model>, AppError> {
    let folder = repos::folders::find_by_id(db, folder_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Folder not found".into()))?;

    let account = repos::accounts::find_by_id_and_user(db, folder.account_id, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Account not found".into()))?;

    let cfg = account_to_config(&account);
    let mut imap = tokimo_package_mail::MailSession::connect(&cfg)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP connect: {e}")))?;

    let (total, _, _) = imap
        .open_folder_ex(&folder.name)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP SELECT '{}': {e}", folder.name)))?;

    if total == 0 {
        imap.logout().await;
        return Ok(Vec::new());
    }

    // IMAP sequences are 1-based, newest messages have the highest numbers.
    let end = total.saturating_sub((page - 1) * page_size);
    let start = Ord::max(end.saturating_sub(page_size - 1), 1);
    if start > end {
        imap.logout().await;
        return Ok(Vec::new());
    }

    let seq_range = format!("{start}:{end}");
    let summaries = imap.fetch_summaries_by_seq(&seq_range).await.unwrap_or_default();

    // Store to DB so messages have PKs.
    store_summaries_batch(db, account.id, &folder, &summaries).await?;
    imap.logout().await;

    // Query back from DB to get PKs.
    let (messages, _) = repos::messages::list_by_folder(db, folder_id, page, page_size).await?;
    Ok(messages)
}

async fn sync_folder_messages(
    db: &DatabaseConnection,
    cfg: &tokimo_package_mail::MailAccountConfig,
    account_id: Uuid,
    user_id: Uuid,
    folder: &mail_folders::Model,
    event_tx: Option<&dyn EventBroadcaster>,
) -> Result<(), AppError> {
    let mut imap = tokimo_package_mail::MailSession::connect(cfg)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP connect for '{}': {e}", folder.name)))?;

    let (total, _unseen, uid_validity) = imap
        .open_folder_ex(&folder.name)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP select '{}': {e}", folder.name)))?;

    #[allow(clippy::cast_possible_wrap)]
    let folder = if let Some(server_uv) = uid_validity {
        let server_stored = server_uv as i32;
        match folder.uid_validity {
            Some(cached) if cached == server_stored => folder.clone(),
            Some(cached) => {
                warn!(
                    "Folder '{}': UIDVALIDITY changed {cached} → {server_uv}; purging local cache and resyncing",
                    folder.name
                );
                let removed = repos::messages::delete_all_in_folder(db, account_id, folder.id).await?;
                info!(
                    "Folder '{}': purged {removed} messages after UIDVALIDITY change",
                    folder.name
                );
                repos::folders::reset_uid_validity(db, folder.id, server_uv).await?;
                repos::folders::find_by_id(db, folder.id)
                    .await?
                    .ok_or_else(|| AppError::Internal(format!("Folder {} vanished during resync", folder.id)))?
            }
            None => {
                repos::folders::reset_uid_validity(db, folder.id, server_uv).await?;
                repos::folders::find_by_id(db, folder.id)
                    .await?
                    .ok_or_else(|| AppError::Internal(format!("Folder {} vanished during resync", folder.id)))?
            }
        }
    } else {
        debug!("Folder '{}': server did not return UIDVALIDITY", folder.name);
        folder.clone()
    };
    let folder = &folder;

    // Phase 1: Forward sync (new summaries)
    let max_uid = repos::messages::max_uid_in_folder(db, account_id, folder.id).await?;

    let total = if let Some(max_uid) = max_uid {
        if total > 0 {
            let uid_range = format!("{}:*", max_uid + 1);
            match imap.fetch_summaries_by_uids(&uid_range).await {
                Ok(summaries) => {
                    store_summaries_batch(db, account_id, folder, &summaries).await?;
                }
                Err(e) => warn!("Folder '{}': forward sync fetch failed: {e}", folder.name),
            }
        }
        total
    } else {
        if total > 0 {
            let start = total.saturating_sub(199);
            let seq_range = format!("{start}:{total}");
            match imap.fetch_summaries_by_seq(&seq_range).await {
                Ok(summaries) => {
                    store_summaries_batch(db, account_id, folder, &summaries).await?;
                }
                Err(e) => warn!("Folder '{}': first fetch failed: {e}", folder.name),
            }
        }
        total
    };

    // Phase 2: Progressive history backfill
    let mut cursor = folder.history_sync_cursor;
    while cursor != Some(0) {
        match backfill_history_session(db, &mut imap, account_id, folder, cursor).await {
            Ok(new_cursor) => cursor = Some(new_cursor),
            Err(e) => {
                let cursor_uid = cursor.and_then(|c| u32::try_from(c).ok()).unwrap_or(0);
                let new_cursor = if cursor_uid > 1 {
                    Ord::max(cursor_uid.saturating_sub(HISTORY_BATCH_RANGE), 1) as i32
                } else {
                    0
                };
                warn!(
                    "History backfill failed for folder '{}' at cursor {:?}: {e}; advancing cursor to {new_cursor}",
                    folder.name, cursor
                );
                if let Err(upd_err) = update_history_cursor(db, folder, new_cursor).await {
                    warn!("Folder '{}': failed to persist fallback cursor: {upd_err}", folder.name);
                    break;
                }
                cursor = Some(new_cursor);
                if new_cursor == 0 {
                    break;
                }
            }
        }
    }

    // Phase 3: Reconcile
    let local_msgs = repos::messages::list_uids_in_folder(db, account_id, folder.id)
        .await
        .ok();

    if cursor == Some(0) {
        match imap.list_all_uids().await {
            Ok(server_uids) => {
                if let Some(ref rows) = local_msgs {
                    let server_set: std::collections::HashSet<i32> = server_uids.iter().map(|&u| u as i32).collect();
                    let stale_ids: Vec<i32> = rows
                        .iter()
                        .filter(|(_, uid, _)| !server_set.contains(uid))
                        .map(|(id, _, _)| *id)
                        .collect();
                    if !stale_ids.is_empty() {
                        match repos::messages::delete_many(db, &stale_ids).await {
                            Ok(()) => info!("Folder '{}': removed {} stale messages", folder.name, stale_ids.len()),
                            Err(e) => warn!("Folder '{}': reconcile failed: {e}", folder.name),
                        }
                    }
                }
            }
            Err(e) => warn!("Folder '{}': list_all_uids failed: {e}", folder.name),
        }
    }

    // Phase 4: Flag sync
    imap.logout().await;
    match sync_flags_session(db, cfg, account_id, folder, local_msgs).await {
        Ok((read_uids, unread_uids)) => {
            if (!read_uids.is_empty() || !unread_uids.is_empty())
                && let Some(tx) = event_tx
            {
                tx.broadcast_flags_synced(user_id, &account_id.to_string(), &folder.id.to_string(), read_uids, unread_uids);
            }
        }
        Err(e) => warn!("Folder '{}': flag sync failed: {e}", folder.name),
    }

    // Update folder counts
    let unread = repos::messages::count_unread(db, folder.id).await?;
    let mut active: mail_folders::ActiveModel = folder.clone().into();
    active.total_count = Set(total as i32);
    active.unread_count = Set(unread as i32);
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(db).await?;

    Ok(())
}

pub async fn store_summaries_batch(
    db: &DatabaseConnection,
    account_id: Uuid,
    folder: &mail_folders::Model,
    summaries: &[tokimo_package_mail::MailMessageSummary],
) -> Result<(), AppError> {
    if summaries.is_empty() {
        return Ok(());
    }
    let candidate_uids: Vec<i32> = summaries.iter().map(|s| s.uid as i32).collect();
    let existing = repos::messages::existing_uids_in_folder(db, account_id, folder.id, &candidate_uids).await?;

    let mut stored = 0usize;
    for s in summaries {
        if existing.contains(&(s.uid as i32)) {
            continue;
        }
        if let Err(e) = repos::messages::create_from_summary(db, account_id, folder.id, s).await {
            warn!("Folder '{}': failed to store summary uid={}: {e}", folder.name, s.uid);
        } else {
            stored += 1;
        }
    }
    if stored > 0 {
        debug!("Folder '{}': stored {} summaries", folder.name, stored);
    }
    Ok(())
}

const HISTORY_BATCH_RANGE: u32 = 2000;

async fn backfill_history_session(
    db: &DatabaseConnection,
    imap: &mut tokimo_package_mail::MailSession,
    account_id: Uuid,
    folder: &mail_folders::Model,
    cursor: Option<i32>,
) -> Result<i32, AppError> {
    let cursor_uid = match cursor {
        Some(c) if c > 0 => c as u32,
        None => {
            let min_uid = repos::messages::min_uid_in_folder(db, account_id, folder.id).await?;
            match min_uid {
                Some(uid) if uid > 1 => uid as u32,
                _ => {
                    update_history_cursor(db, folder, 0).await?;
                    return Ok(0);
                }
            }
        }
        _ => return Ok(0),
    };

    if cursor_uid <= 1 {
        update_history_cursor(db, folder, 0).await?;
        return Ok(0);
    }

    let low = Ord::max(cursor_uid.saturating_sub(HISTORY_BATCH_RANGE), 1);
    let high = cursor_uid - 1;
    let uid_range = format!("{low}:{high}");

    debug!("Folder '{}': history backfill UID range {uid_range}", folder.name);

    if let Err(e) = imap.open_folder(&folder.name).await {
        return Err(AppError::Internal(format!("IMAP re-select '{}': {e}", folder.name)));
    }

    let summaries = imap
        .fetch_summaries_by_uids(&uid_range)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP history backfill: {e}")))?;

    if !summaries.is_empty() {
        info!(
            "Folder '{}': backfilling {} summaries (UID {}..{})",
            folder.name,
            summaries.len(),
            low,
            high
        );
        store_summaries_batch(db, account_id, folder, &summaries).await?;
    }

    let new_cursor = if low <= 1 { 0 } else { low as i32 };
    update_history_cursor(db, folder, new_cursor).await?;

    if new_cursor == 0 {
        info!("Folder '{}': history sync complete", folder.name);
    }
    Ok(new_cursor)
}

async fn update_history_cursor(
    db: &DatabaseConnection,
    folder: &mail_folders::Model,
    cursor: i32,
) -> Result<(), AppError> {
    let mut active: mail_folders::ActiveModel = folder.clone().into();
    active.history_sync_cursor = Set(Some(cursor));
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(db).await.map_err(AppError::Database)?;
    Ok(())
}

const FLAGS_BATCH: usize = 500;

async fn sync_flags_session(
    db: &DatabaseConnection,
    cfg: &tokimo_package_mail::MailAccountConfig,
    account_id: Uuid,
    folder: &mail_folders::Model,
    prefetched: Option<Vec<(i32, i32, bool)>>,
) -> Result<(Vec<i32>, Vec<i32>), AppError> {
    let local_msgs = match prefetched {
        Some(v) if !v.is_empty() => v,
        Some(_) => return Ok((vec![], vec![])),
        None => {
            let v = repos::messages::list_uids_in_folder(db, account_id, folder.id).await?;
            if v.is_empty() {
                return Ok((vec![], vec![]));
            }
            v
        }
    };

    let mut imap = tokimo_package_mail::MailSession::connect(cfg)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP connect for flags '{}': {e}", folder.name)))?;
    imap.open_folder(&folder.name)
        .await
        .map_err(|e| AppError::Internal(format!("IMAP select for flags '{}': {e}", folder.name)))?;

    let all_uids: Vec<u32> = local_msgs.iter().map(|(_, uid, _)| *uid as u32).collect();
    let mut imap_flags: std::collections::HashMap<u32, bool> = std::collections::HashMap::new();

    for chunk in all_uids.chunks(FLAGS_BATCH) {
        let uid_set = chunk
            .iter()
            .map(std::string::ToString::to_string)
            .collect::<Vec<_>>()
            .join(",");
        match imap.fetch_flags_batch(&uid_set).await {
            Ok(batch) => {
                for (uid, seen, _flagged) in batch {
                    imap_flags.insert(uid, seen);
                }
            }
            Err(e) => warn!("Folder '{}': flags batch failed: {e}", folder.name),
        }
    }

    let mut to_mark_read: Vec<i32> = Vec::new();
    let mut to_mark_unread: Vec<i32> = Vec::new();

    for (_msg_id, uid, local_is_read) in &local_msgs {
        if let Some(&imap_seen) = imap_flags.get(&(*uid as u32)) {
            if imap_seen && !local_is_read {
                to_mark_read.push(*uid);
            } else if !imap_seen && *local_is_read {
                to_mark_unread.push(*uid);
            }
        }
    }

    if !to_mark_read.is_empty() {
        repos::messages::update_read_by_uids(db, account_id, folder.id, &to_mark_read, true).await?;
    }
    if !to_mark_unread.is_empty() {
        repos::messages::update_read_by_uids(db, account_id, folder.id, &to_mark_unread, false).await?;
    }

    imap.logout().await;
    Ok((to_mark_read, to_mark_unread))
}

fn detect_folder_type(raw_name: &str, attributes: &[String]) -> String {
    let decoded = tokimo_package_mail::decode_mailbox_name(raw_name);
    let base = decoded.rsplit_once('/').map_or(decoded.as_str(), |(_, b)| b);
    let lower = base.to_lowercase();
    let attr_str = attributes.join(" ").to_lowercase();

    if attr_str.contains("\\inbox") || lower == "inbox" {
        return "inbox".into();
    }
    if attr_str.contains("\\sent") || lower.contains("sent") || base.contains("已发送") || base.contains("已发邮件")
    {
        return "sent".into();
    }
    if attr_str.contains("\\drafts") || lower.contains("draft") || base.contains("草稿") {
        return "drafts".into();
    }
    if attr_str.contains("\\trash")
        || lower.contains("trash")
        || lower.contains("deleted")
        || base.contains("废纸篓")
        || base.contains("已删除")
    {
        return "trash".into();
    }
    if attr_str.contains("\\junk") || lower.contains("junk") || lower.contains("spam") || base.contains("垃圾") {
        return "junk".into();
    }
    if attr_str.contains("\\all") || attr_str.contains("\\archive") || lower.contains("archive") || base.contains("所有邮件")
    {
        return "archive".into();
    }
    if attr_str.contains("\\flagged") || lower.contains("starred") || lower.contains("flagged") || base.contains("已加星标")
    {
        return "starred".into();
    }
    if attr_str.contains("\\important") || lower.contains("important") || base.contains("重要") {
        return "important".into();
    }
    "custom".into()
}

fn folder_sort_order(folder_type: &str) -> i32 {
    match folder_type {
        "inbox" => 0,
        "drafts" => 1,
        "sent" => 2,
        "archive" => 3,
        "junk" => 4,
        "trash" => 5,
        _ => 10,
    }
}
