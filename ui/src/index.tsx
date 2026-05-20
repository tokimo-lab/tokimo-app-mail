/**
 * Tokimo Mail App — standalone multi-process app.
 *
 * Uses @tokimo/sdk for shell integration, generated API client for data fetching.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  type AppRuntimeCtx,
  type Dispose,
  defineApp,
  makeTranslator,
} from "@tokimo/sdk";
import {
  useShellMenuBar,
  useShellToast,
} from "@tokimo/sdk/react";
import {
  Button,
  ConfigProvider,
  Empty,
  Input,
  Spin,
  ToastProvider,
  enUS as uiEnUS,
  zhCN as uiZhCN,
} from "@tokimo/ui";
import { Inbox, Mail, Plus, Search } from "lucide-react";
import {
  StrictMode,
  useCallback,
  useMemo,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { mailApi } from "./generated/rust-api";
import type { MailMessageFullOutput } from "./generated/rust-types";
import { enUS, zhCN } from "./i18n";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

// ── i18n ─────────────────────────────────────────────────────────────────────

const translations = {
  "zh-CN": {
    title: "邮件",
    noAccounts: "尚未配置邮件账户",
    addAccount: "添加账户",
    noMessages: "暂无邮件",
    selectFolder: "请选择文件夹",
    from: "发件人",
    to: "收件人",
    subject: "主题",
    date: "日期",
    attachments: "附件",
    sync: "同步",
    search: "搜索",
    searchPlaceholder: "搜索邮件...",
    loading: "加载中...",
    compose: "写邮件",
  },
  "en-US": {
    title: "Mail",
    noAccounts: "No mail accounts configured",
    addAccount: "Add Account",
    noMessages: "No messages",
    selectFolder: "Select a folder",
    from: "From",
    to: "To",
    subject: "Subject",
    date: "Date",
    attachments: "Attachments",
    sync: "Sync",
    search: "Search",
    searchPlaceholder: "Search messages...",
    loading: "Loading...",
    compose: "Compose",
  },
};

// ── Main component ───────────────────────────────────────────────────────────

function MailWindow({ ctx }: { ctx: AppRuntimeCtx }) {
  const t = makeTranslator(translations, ctx.locale);
  const toast = useShellToast(ctx);

  const { data: accounts = [], isLoading: accountsLoading } = mailApi.listAccounts.useQuery();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MailMessageFullOutput | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const activeAccountId = selectedAccountId ?? (accounts.length > 0 ? accounts[0].id : null);

  const { data: folders = [] } = mailApi.listFolders.useQuery(
    { accountId: activeAccountId ?? "" },
    { enabled: !!activeAccountId }
  );

  const { data: messageList } = mailApi.listMessages.useQuery(
    { accountId: activeAccountId ?? "", folderId: selectedFolderId ?? "" },
    { enabled: !!activeAccountId && !!selectedFolderId }
  );

  const messages = messageList?.messages ?? [];

  // Auto-select first folder (inbox).
  const inbox = folders.find((f) => f.folderType === "inbox");
  if (inbox && !selectedFolderId && folders.length > 0) {
    setSelectedFolderId(inbox.id);
  }

  const getMessage = mailApi.getMessage.useMutation({
    onSuccess: (msg) => setSelectedMessage(msg),
  });

  const handleSelectMessage = useCallback((id: string) => {
    getMessage.mutate({ messageId: id });
  }, [getMessage]);

  const syncFolders = mailApi.syncFolders.useMutation({
    onSuccess: () => toast.success("Sync complete"),
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });

  const handleSync = useCallback(() => {
    if (activeAccountId) syncFolders.mutate({ accountId: activeAccountId });
  }, [activeAccountId, syncFolders]);

  // Menu bar.
  useShellMenuBar(ctx, useMemo(() => ({
    menus: [{
      key: "mail",
      label: t("title"),
      items: [
        { key: "sync", label: t("sync"), onClick: handleSync },
        { key: "compose", label: t("compose"), onClick: () => toast.info("Compose not yet available") },
      ],
    }],
    about: { description: "Tokimo Mail", version: "0.1.0" },
  }), [t, toast, handleSync]));

  if (accountsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Mail className="size-16 stroke-1 opacity-30" />
        <p className="text-sm opacity-60">{t("noAccounts")}</p>
        <Button variant="primary" onClick={() => toast.info("Add account via web UI")}>
          <Plus size={14} /> {t("addAccount")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full text-[var(--text-primary)]">
      {/* Sidebar — accounts + folders */}
      <aside className="flex w-[220px] flex-col border-r border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]">
        <div className="flex items-center gap-2 border-b border-black/10 dark:border-white/10 px-3 py-3">
          <Mail size={18} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold">{t("title")}</span>
        </div>

        <div className="px-2 py-2">
          <select
            className="w-full rounded border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-xs cursor-pointer"
            value={activeAccountId ?? ""}
            onChange={(e) => { setSelectedAccountId(e.target.value); setSelectedFolderId(null); setSelectedMessage(null); }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.email}</option>
            ))}
          </select>
        </div>

        <nav className="flex-1 overflow-auto px-1 py-1">
          {folders.map((f) => {
            const active = f.id === selectedFolderId;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => { setSelectedFolderId(f.id); setSelectedMessage(null); }}
                className={`w-full cursor-pointer rounded px-2 py-1.5 text-left text-xs transition flex items-center justify-between ${
                  active
                    ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
                    : "hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                }`}
              >
                <span>{f.name}</span>
                {f.unreadCount > 0 && (
                  <span className="rounded-full bg-[var(--accent)] text-white text-[10px] px-1.5 min-w-[18px] text-center">
                    {f.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Message list */}
      <div className="flex w-[320px] flex-col border-r border-black/10 dark:border-white/10">
        <div className="flex items-center gap-2 border-b border-black/10 dark:border-white/10 px-3 py-2">
          <Search size={12} className="opacity-50" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="flex-1"
            size="small"
          />
        </div>
        <div className="flex-1 overflow-auto">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Empty description={selectedFolderId ? t("noMessages") : t("selectFolder")} />
            </div>
          ) : (
            messages
              .filter((m) =>
                searchQuery
                  ? m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    m.from.some((a) => a.address.toLowerCase().includes(searchQuery.toLowerCase()))
                  : true
              )
              .map((m) => {
                const active = selectedMessage?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectMessage(m.id)}
                    className={`w-full cursor-pointer border-b border-black/5 dark:border-white/5 px-3 py-2 text-left transition ${
                      active ? "bg-[var(--accent-subtle)]" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs truncate flex-1 ${m.isRead ? "opacity-60" : "font-semibold"}`}>
                        {m.from[0]?.name || m.from[0]?.address || "(no sender)"}
                      </span>
                      <span className="text-[10px] opacity-40 ml-2 shrink-0">
                        {m.date ? new Date(m.date).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${m.isRead ? "opacity-50" : ""}`}>
                      {m.subject}
                    </p>
                    <p className="text-[10px] opacity-40 truncate mt-0.5">{m.preview}</p>
                  </button>
                );
              })
          )}
        </div>
      </div>

      {/* Message detail */}
      <main className="flex-1 overflow-auto">
        {selectedMessage ? (
          <div className="px-6 py-4">
            <h2 className="text-lg font-semibold mb-3">{selectedMessage.subject}</h2>
            <div className="text-xs opacity-60 space-y-1 mb-4">
              <p><span className="font-medium">{t("from")}:</span> {selectedMessage.from.map((a) => a.name || a.address).join(", ")}</p>
              <p><span className="font-medium">{t("to")}:</span> {selectedMessage.to.map((a) => a.name || a.address).join(", ")}</p>
              {selectedMessage.date && <p><span className="font-medium">{t("date")}:</span> {new Date(selectedMessage.date).toLocaleString()}</p>}
            </div>
            {selectedMessage.attachments.length > 0 && (
              <div className="mb-4 text-xs">
                <span className="font-medium">{t("attachments")}:</span>{" "}
                {selectedMessage.attachments.map((a) => a.filename).join(", ")}
              </div>
            )}
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {selectedMessage.textBody ? (
                <pre className="whitespace-pre-wrap font-sans text-sm">{selectedMessage.textBody}</pre>
              ) : selectedMessage.htmlBody ? (
                <div dangerouslySetInnerHTML={{ __html: selectedMessage.htmlBody }} />
              ) : (
                <p className="opacity-40">[No body content]</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Empty image={<Mail className="size-10 stroke-1" />} description="Select a message" />
          </div>
        )}
      </main>
    </div>
  );
}

// ── App definition ───────────────────────────────────────────────────────────

export default defineApp({
  id: "mail",
  manifest: {
    id: "mail",
    appName: "Mail",
    icon: "Mail",
    image: "icon.png",
    color: "#3b82f6",
    windowType: "mail",
    defaultSize: { width: 1200, height: 800 },
    category: "system",
  },
  translations: { "zh-CN": zhCN, "en-US": enUS },
  mount(container, ctx): Dispose {
    const root: Root = createRoot(container);
    const locale = ctx.locale.startsWith("zh") ? uiZhCN : uiEnUS;
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <ConfigProvider locale={locale}>
            <ToastProvider>
              <MailWindow ctx={ctx} />
            </ToastProvider>
          </ConfigProvider>
        </QueryClientProvider>
      </StrictMode>,
    );
    return () => root.unmount();
  },
});
