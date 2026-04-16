# 📧 邮件 App 架构分析报告

## 一、现状评估：**中上水平（B+）**

### ✅ 已经做对的（符合业内标准做法）

1. **混合 Pull + Push 架构** ✓ 这是 Thunderbird / FairEmail / Apple Mail 的标准做法
   - IDLE 长连接 2 分钟超时（规避 QQ 邮箱等非标准实现的经典做法，很专业）
   - 60s 轮询兜底

2. **分阶段 Sync 策略** ✓ 设计合理
   - ENVELOPE-first（快 2.5-3x）+ body 懒加载 → 这正是 Gmail Web 客户端的做法
   - Progressive backfill + cursor 恢复 → 符合 JMAP `/queryChanges` 理念
   - Bisect "poisoned UIDs" → 这是与真实世界 IMAP 服务器斗争的经验之谈

3. **库选型** ✓ 全部是 Rust 生态里的第一梯队
   - `async-imap` + `lettre` + `mailparse` 是目前 Rust 邮件栈的最佳组合（Himalaya CLI 同款）

4. **Store 策略** ✓ summary/body 分离是正确的

5. **WebSocket 推送 + 乐观更新** ✓ 比 Thunderbird 都现代

---

## 二、关键缺陷（距离"业内最佳"的差距）

### 🔴 高危：正确性问题

| # | 问题 | 后果 | 工业标准 |
|---|---|---|---|
| 1 | **UIDVALIDITY 未校验** | 服务器重排 UID 时会静默同步错数据 | RFC 3501 强制要求 |
| 2 | **没有 CONDSTORE / MODSEQ** | 无法增量同步 flag；每次 SEARCH ALL 扫全库 | Dovecot/Exchange 都支持，开销降 100x |
| 3 | **QRESYNC 缺失** | 断线重连后要重新 SEARCH 全量 diff | RFC 7162 |

### 🟡 中危：架构层面

| # | 问题 | 影响 |
|---|---|---|
| 4 | **每操作开新 IMAP session** | 连接开销大（TLS 握手），Gmail 会限流。业内做法：**连接池 per account**（2-3 条长连接复用） |
| 5 | **搜索是 `ILIKE` 全表扫描** | 超过 10k 邮件即不可用。应上 **PostgreSQL tsvector + GIN 索引**（或 Meilisearch） |
| 6 | **没有会话（Thread）视图** | Headers 存了 `in_reply_to`/`references` 却不用，白费存储。业内做法：入库时计算 `thread_id`（JWZ 算法或 Gmail 的 X-GM-THRID） |
| 7 | **没有统一收件箱（Unified Inbox）** | 多账号体验差 |
| 8 | **没有 Drafts 自动保存到服务器** | 换设备丢草稿 |

### 🟢 低危：体验层

9. IMAP COMPRESS=DEFLATE 未开（大邮箱流量大）
10. Gmail 特有的 X-GM-EXT-1（标签、搜索语法）未利用
11. 没有 OAuth2（目前依赖 app password），Gmail/Outlook 官方已强制 OAuth2
12. 附件无流式下载（大附件会 OOM）

---

## 三、和业内最佳的差距对比

**业内最佳参考系：**
- **Gmail Web** — Google 自研，标杆
- **FairEmail (Android)** — 开源 IMAP 客户端天花板
- **Thunderbird** — 桌面端参考
- **JMAP (Fastmail)** — 新一代协议标准

| 维度 | Tokimo | 业内最佳 | 差距 |
|---|---|---|---|
| 协议能力 | IMAP 基础 + IDLE | IMAP + CONDSTORE + QRESYNC + COMPRESS + OAuth2 | **明显差距** |
| 增量同步 | max_uid cursor | MODSEQ-based | **明显差距** |
| 搜索 | ILIKE | FTS / 服务端搜索 | **明显差距** |
| 线程 | 无 | JWZ 算法 | **明显差距** |
| Push | IMAP IDLE | IDLE + FCM（移动端） | 架构不同，可忽略 |
| 连接复用 | 无 | 连接池 | 中等差距 |
| 多账号 | 独立 | Unified Inbox | 中等差距 |

**结论：不是业内最佳，但远超"能用"级别。** 大致相当于 **2015 年的 Thunderbird** 水平——工程扎实，但缺少现代 IMAP 扩展（CONDSTORE/QRESYNC）和现代搜索。

---

## 四、推荐优化路线（按 ROI 排序）

### P0 — 正确性（必做）
1. **加 UIDVALIDITY 校验**：每次 SELECT 后对比，不一致即清空该 folder 重新全量同步。**改动小、收益大**。

### P1 — 性能（立刻感知）
2. **PostgreSQL FTS**：加 `tsvector` 列 + GIN 索引，搜索速度 100x。
3. **IMAP 连接池**：每账号 2-3 条长连（1 条 IDLE、1-2 条 FETCH），减少 TLS 握手、规避 Gmail 限流。
4. **CONDSTORE (MODSEQ)**：flag 同步从 "SEARCH ALL 扫全库" → "FETCH CHANGEDSINCE <modseq>"。

### P2 — 体验
5. **Thread 聚合**：入库时用 JWZ 算法计算 `thread_id`，列表加 "Group by conversation" 开关。
6. **Unified Inbox**：跨账号虚拟 folder。
7. **OAuth2 (Gmail/Outlook)**：为 2027 年铺路（app password 正在被淘汰）。

### P3 — Nice to have
8. QRESYNC（断线重连 diff）
9. IMAP COMPRESS=DEFLATE
10. 草稿服务端自动保存
11. 附件流式下载

---

## 五、一句话结论

> **当前架构是"扎实的 2015 级 IMAP 客户端"**，选型专业、工程细节到位（IDLE 2min 超时、poisoned UID bisect 这些细节看得出是踩过坑的），但**缺少现代 IMAP 扩展（CONDSTORE/QRESYNC/COMPRESS）、会话线程、全文搜索、连接池四大件**——补齐这四项就能进入业内一线梯队。最该优先做的是 **UIDVALIDITY 校验（正确性）** + **PostgreSQL FTS（搜索）** + **连接池（性能）**。

