# tokimo-app-mail

Tokimo 邮件客户端 app —— IMAP/SMTP 多账户管理。基于 Tokimo 多进程 app 架构
（axum-on-UDS + 主 server 透明反代，类型边界 via [`ts-rs`](https://github.com/Aleph-Alpha/ts-rs)）。

## Architecture

```
Browser
  │  /api/apps/mail/<route>
  ▼
tokimo-server (5678)        — auth / CORS / 注入 X-Tokimo-User-Id
  │  透明反代 → UDS
  ▼
$DATA_LOCAL_PATH/apps/mail.sock
  │
this binary (resident)
  ├─ axum router (src/app_server.rs + src/handlers/)
  │   ├─ /accounts                 账户 CRUD + 自动检测 provider 预设
  │   ├─ /accounts/{id}/folders    文件夹列表 / 拉取
  │   ├─ /accounts/{id}/messages   邮件列表 / 详情 / 标记 / 移动 / 删除
  │   ├─ /accounts/{id}/send       发送邮件
  │   ├─ /accounts/{id}/sync       手动触发同步
  │   ├─ /search                   全文搜索
  │   ├─ /presets                  内置 provider 预设（Gmail / Outlook / 163 等）
  │   └─ /assets/{*path}           rust-embed 嵌入 ui/dist
  ├─ scheduler (src/scheduler.rs)  定时按账户 sync
  ├─ Postgres direct (schema=mail) 启动跑 migrations
  └─ ts-rs                         所有 DTO 生成 ui/src/generated/rust-types/
```

## What it shows

- 第一个使用 `ts-rs` 的 Tokimo app —— Rust handler DTO 通过 `#[derive(TS)]` 自动导出到
  `ui/src/generated/rust-types/`，前端调用全部类型安全
- 标准 axum handler 签名（`State<Arc<AppCtx>>` / `Json<Req>` / `Result<_, AppError>`）
- `TokimoUser` extractor 从主 server 反代注入的 `x-tokimo-user-id` 读取用户身份
- 后台 `scheduler` 周期同步多账户的 IMAP 文件夹 + 邮件
- IMAP / SMTP 通过 [`mail-send`](https://docs.rs/mail-send) + [`imap-codec`](https://docs.rs/imap-codec) 实现
- rust-embed 嵌入 `ui/dist`，dev 模式下 `TOKIMO_APP_ASSETS_DIR_*` 走文件系统
- 优雅关闭：SIGINT / broker `Shutdown` 帧

## CLI 用法

前置条件：

1. 启动 Tokimo 主 server（默认 `http://localhost:5678`）。
2. 浏览器登录后，在「设置 → API Keys」创建一个 `mm_xxx` token。
3. 通过 `--tokimo-token` 或 `TOKIMO_TOKEN` 环境变量传入 token。
4. `DATABASE_URL` 指向 Tokimo 数据库（与主 server 一致）—— **CLI 直接读写数据库，不经主 server**。

### 子命令一览

```text
Usage: tokimo-app-mail [OPTIONS] [COMMAND]

Commands:
  accounts  管理邮件账户（list / get / test）
  folders   管理文件夹（list / pull）
  messages  管理邮件（list / read / mark-read / mark-unread / delete / move）
  send      发送邮件
  sync      同步账户邮件（文件夹 + 邮件）
  search    搜索邮件
```

### 示例

```bash
export TOKIMO_TOKEN=mm_xxx
export DATABASE_URL=postgres://...

# 账户
tokimo-app-mail accounts list
tokimo-app-mail accounts get <ACCOUNT_ID>
tokimo-app-mail accounts test <ACCOUNT_ID>      # 验证 IMAP + SMTP 凭证

# 文件夹
tokimo-app-mail folders list <ACCOUNT_ID>
tokimo-app-mail folders pull <ACCOUNT_ID>       # 从远端刷新文件夹列表

# 邮件
tokimo-app-mail messages <ACCOUNT_ID> list --folder INBOX --limit 50
tokimo-app-mail messages <ACCOUNT_ID> read <MESSAGE_ID>
tokimo-app-mail messages <ACCOUNT_ID> mark-read <MESSAGE_ID>
tokimo-app-mail messages <ACCOUNT_ID> move <MESSAGE_ID> --to Archive

# 发送
tokimo-app-mail send <ACCOUNT_ID> \
  --to alice@example.com --to bob@example.com \
  --subject "Hello" --body "Hi from CLI"

# 同步
tokimo-app-mail sync <ACCOUNT_ID>

# 搜索
tokimo-app-mail search --query "invoice" --account <ACCOUNT_ID>
```

> **新增账户**目前请通过 UI 完成（涉及 OAuth / 密码加密、provider 预设挑选等）。

## 本地开发循环

### 改 Rust（含 CLI + server）

```bash
cargo build -p tokimo-app-mail
# supervisor 不会自动检测 binary mtime，需手动 kill 让它 respawn：
pkill -f tokimo-app-mail
```

主仓 `bun dev --apps=mail` 已经包好这个循环：监听 `apps/tokimo-app-mail/src/` 改动 →
自动 `cargo run` → 自动重启进程。

### 改 Rust DTO（ts-rs 导出）

```bash
# 主仓根目录
bun gen:api
# 或仅本 app
cd apps/tokimo-app-mail && cargo test --lib export_bindings
```

输出到 `ui/src/generated/rust-types/`。`bun dev --apps=mail` 会自动 watch
`src/*.rs` 变化重新跑 `cargo test export_bindings`，UI 端类型实时更新。

### 改 UI（不用 cargo build）

`scripts/dev.sh` 已通过 `tokimo-app.toml` 的 `runtime.ui_dist` 字段为每个 app 注入
`TOKIMO_APP_ASSETS_DIR`，资源 handler 优先读文件系统而不是 embed。

```bash
pnpm -C apps/tokimo-app-mail/ui build --watch
# 浏览器强刷即可生效
```

#### UI 构建配置：`@tokimo/app-builder`

`ui/vite.config.ts` 只有一行 `defineTokimoApp()`，完整的 library 模式 + externals
配置由共享预设 [`@tokimo/app-builder`](https://github.com/tokimo-lab/tokimo)
（主仓 `packages/tokimo-app-builder/`）提供：

- **externals**：`react` / `react-dom` / `@tokimo/ui` / `@tokimo/sdk` 全部不打进 bundle，
  由主 shell 通过 `<script type="importmap">` + `window.__TKM_DEPS__` 注入同一份实例
- **产物**：`dist/index.js` + `dist/index.css`，被主 server 反代到 `/api/apps/mail/assets/`

### 独立开发（不依赖主仓）

```bash
git clone git@github.com:tokimo-lab/tokimo-app-mail.git
cd tokimo-app-mail/ui
pnpm install   # 拉 @tokimo/ui / @tokimo/sdk / @tokimo/app-builder 的 git 源码
pnpm dev       # vite watch
```

主仓内开发时，`ui/.pnpmfile.cjs` 会自动检测主仓上下文，把这三个依赖改写为 `file:`
路径直接 link 到主仓 submodule，无需 bump sha 即可看到 ui/sdk 的修改。

## CI

- `.github/workflows/ci.yml`：matrix（ubuntu / macos / windows）跑 `cargo build` + `cargo test`，
  外加 ubuntu 上 `cargo fmt --check` + `cargo clippy -D warnings`
- pre-push hook（`lefthook.yml`）镜像 CI 的 fmt + clippy，本地阻挡破坏推送
- pre-commit hook 自动 `rustfmt` + `biome format` staged 文件

## License

MIT OR Apache-2.0.
