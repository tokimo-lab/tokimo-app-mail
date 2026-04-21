import { useQueryClient } from "@tanstack/react-query";
import {
  AppSidebar,
  type AppSidebarSection,
  Badge,
  ContextMenu,
  type ContextMenuItem,
  cn,
  Spin,
  Tooltip,
} from "@tokimo/ui";
import {
  AlertCircle,
  Archive,
  Inbox,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/generated/rust-api";
import type {
  MailAccountOutput,
  MailFolderOutput,
} from "@/generated/rust-api/mail";
import { MaterialFileIcon } from "@/shared/components/icons/MaterialFileIcon";
import { useWs } from "@/system/events/ws";

const SPECIAL_FOLDER_ICONS: Record<string, typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  drafts: Pencil,
  trash: Trash2,
  junk: AlertCircle,
  spam: AlertCircle,
  archive: Archive,
  starred: Star,
  flagged: Star,
};

function getFolderIconElement(folderType: string, folderName: string) {
  const Icon =
    SPECIAL_FOLDER_ICONS[folderType] ??
    SPECIAL_FOLDER_ICONS[folderName.toLowerCase()];
  if (Icon) {
    return <Icon className="size-4" />;
  }
  return <MaterialFileIcon name={folderName} isDirectory size={16} />;
}

/** Color palette for account icons (cycles through). */
const ACCOUNT_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
];

// ── Account row with self-fetched unread count ────────────────────────────

function AccountItem({
  account,
  colorIndex,
  isSelected,
  collapsed,
  onSelect,
  onEdit,
  onDelete,
}: {
  account: MailAccountOutput;
  colorIndex: number;
  isSelected: boolean;
  collapsed?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { data } = api.mail.listFolders.useQuery(
    { accountId: account.id },
    { enabled: true },
  );
  const unread = useMemo(
    () =>
      (data ?? []).reduce((s, f) => s + (f as MailFolderOutput).unreadCount, 0),
    [data],
  );

  const color = ACCOUNT_COLORS[colorIndex % ACCOUNT_COLORS.length];
  const initial = (account.displayName || account.email)[0].toUpperCase();

  const menuItems: ContextMenuItem[] = [
    {
      key: "edit",
      label: t("mail.account.editAccount"),
      icon: <Settings className="size-3.5" />,
      onClick: onEdit,
    },
    { type: "divider" },
    {
      key: "delete",
      label: t("mail.account.deleteAccount"),
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      onClick: onDelete,
    },
  ];

  if (collapsed) {
    return (
      <Tooltip title={account.displayName || account.email} placement="right">
        <ContextMenu items={menuItems}>
          <div className="relative">
            {/* Vertical accent indicator matching AppSidebar collapsed style */}
            {isSelected && (
              <span className="pointer-events-none absolute top-1/2 left-0 z-10 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--accent)]" />
            )}
            <button
              type="button"
              onClick={onSelect}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors"
            >
              <div
                className="flex size-7 items-center justify-center rounded-lg text-[11px] font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {initial}
              </div>
            </button>
            {unread > 0 && (
              <span className="pointer-events-none absolute -top-1 -right-1">
                <Badge
                  count={unread}
                  size="small"
                  overflowCount={Number.POSITIVE_INFINITY}
                />
              </span>
            )}
          </div>
        </ContextMenu>
      </Tooltip>
    );
  }

  return (
    <ContextMenu items={menuItems}>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "mb-0.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
          isSelected
            ? "bg-black/[0.06] font-medium text-fg-primary dark:bg-white/[0.06]"
            : "text-fg-muted hover:bg-black/[0.06] dark:hover:bg-white/[0.06]",
        )}
      >
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {initial}
        </div>
        <span className="min-w-0 flex-1 truncate leading-tight">
          {account.displayName || account.email}
        </span>
        {unread > 0 && (
          <Badge
            count={unread}
            size="small"
            overflowCount={Number.POSITIVE_INFINITY}
          />
        )}
      </button>
    </ContextMenu>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────

interface MailSidebarProps {
  accounts: MailAccountOutput[];
  selectedAccountId: string | null;
  selectedFolderId: string | null;
  collapsed?: boolean;
  onSelectAccount: (id: string) => void;
  onSelectFolder: (id: string) => void;
  onAddAccount: () => void;
  onCompose: () => void;
  onToggleCollapse?: () => void;
  onEditAccount: (account: MailAccountOutput) => void;
  onDeleteAccount: (account: MailAccountOutput) => void;
}

export function MailSidebar({
  accounts,
  selectedAccountId,
  selectedFolderId,
  collapsed,
  onSelectAccount,
  onSelectFolder,
  onAddAccount,
  onCompose,
  onToggleCollapse,
  onEditAccount,
  onDeleteAccount,
}: MailSidebarProps) {
  const { t } = useTranslation();
  // Fetch folders only for the selected account (used for folder list).
  const folderQuery = api.mail.listFolders.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId },
  );
  const folders = (folderQuery.data ?? []) as MailFolderOutput[];

  const syncMutation = api.mail.triggerSync.useMutation();

  // Subscribe to mail:flags_synced to update badges via +/- arithmetic.
  const queryClient = useQueryClient();
  const ws = useWs();
  useEffect(() => {
    return ws.subscribe("mail:flags_synced", (msg) => {
      const data = msg.data as {
        accountId: string;
        folderId: string;
        readUids: number[];
        unreadUids: number[];
      };
      const delta = data.unreadUids.length - data.readUids.length;
      if (delta === 0) return;
      // Update the folder list cache for the matching account.
      const key = api.mail.listFolders.queryKey({
        accountId: data.accountId,
      });
      queryClient.setQueryData<MailFolderOutput[]>(key, (old) => {
        if (!old) return old;
        return old.map((f) => {
          if (f.id !== data.folderId) return f;
          return { ...f, unreadCount: Math.max(0, f.unreadCount + delta) };
        });
      });
    });
  }, [ws, queryClient]);

  // Auto-select inbox folder when folders load for the active account.
  const autoSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedFolderId || !selectedAccountId) return;
    if (folders.length === 0) return;
    if (autoSelectedRef.current === selectedAccountId) return;
    const inbox = folders.find((f) => f.folderType === "inbox");
    const target = inbox ?? folders[0];
    autoSelectedRef.current = selectedAccountId;
    onSelectFolder(target.id);
  }, [selectedAccountId, selectedFolderId, folders, onSelectFolder]);

  // ── Build folder sections for AppSidebar ────────────────────────────────

  const folderSections: AppSidebarSection[] = useMemo(() => {
    if (!selectedAccountId || folders.length === 0) return [];
    return [
      {
        label: t("mail.sidebar.folders"),
        items: folderQuery.isLoading
          ? [
              {
                key: "folders-loading",
                icon: <Spin className="size-4" />,
                label: t("mail.sidebar.loading"),
              },
            ]
          : folders.map((folder) => ({
              key: folder.id,
              icon: getFolderIconElement(folder.folderType, folder.name),
              label: folder.name,
              extra:
                folder.unreadCount > 0 ? (
                  <Badge
                    count={folder.unreadCount}
                    size="small"
                    overflowCount={Number.POSITIVE_INFINITY}
                  />
                ) : undefined,
            })),
      },
    ];
  }, [selectedAccountId, folders, folderQuery.isLoading, t]);

  // ── Footer ──────────────────────────────────────────────────────────────

  const collapsedFooter = (
    <div className="flex flex-col items-center gap-1">
      <Tooltip title={t("mail.sidebar.compose")} placement="right">
        <button
          type="button"
          onClick={onCompose}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-fill-tertiary hover:text-fg-secondary"
        >
          <Pencil className="size-4" />
        </button>
      </Tooltip>
      <Tooltip title={t("mail.sidebar.addAccount")} placement="right">
        <button
          type="button"
          onClick={onAddAccount}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-fill-tertiary hover:text-fg-secondary"
        >
          <Plus className="size-4" />
        </button>
      </Tooltip>
      {selectedAccountId && (
        <Tooltip title={t("mail.sidebar.sync")} placement="right">
          <button
            type="button"
            onClick={() => syncMutation.mutate(selectedAccountId)}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-fill-tertiary hover:text-fg-secondary"
          >
            <RefreshCw
              className={`size-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
            />
          </button>
        </Tooltip>
      )}
      <Tooltip title={t("mail.sidebar.expandSidebar")} placement="right">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-fill-tertiary hover:text-fg-secondary"
        >
          <PanelLeft className="size-4" />
        </button>
      </Tooltip>
    </div>
  );

  const fullFooter = (
    <div className="flex items-center gap-1">
      <Tooltip title={t("mail.sidebar.compose")}>
        <button
          type="button"
          onClick={onCompose}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-fill-tertiary hover:text-fg-secondary"
        >
          <Pencil className="size-4" />
        </button>
      </Tooltip>
      <Tooltip title={t("mail.sidebar.addAccount")}>
        <button
          type="button"
          onClick={onAddAccount}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-fill-tertiary hover:text-fg-secondary"
        >
          <Plus className="size-4" />
        </button>
      </Tooltip>
      {selectedAccountId && (
        <Tooltip title={t("mail.sidebar.sync")}>
          <button
            type="button"
            onClick={() => syncMutation.mutate(selectedAccountId)}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-fill-tertiary hover:text-fg-secondary"
          >
            <RefreshCw
              className={`size-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
            />
          </button>
        </Tooltip>
      )}
      <Tooltip title={t("mail.sidebar.collapseSidebar")}>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ml-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-fill-tertiary hover:text-fg-secondary"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </Tooltip>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <div
        className="flex shrink-0 flex-col overflow-hidden border-r border-border-base bg-[var(--sidebar-bg)] select-none"
        style={{ width: 48 }}
      >
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* Accounts */}
          <div className="flex flex-col items-center gap-0.5 px-1 pt-2">
            {accounts.map((account, i) => (
              <AccountItem
                key={account.id}
                account={account}
                colorIndex={i}
                isSelected={selectedAccountId === account.id}
                collapsed
                onSelect={() => {
                  if (account.id !== selectedAccountId) {
                    onSelectAccount(account.id);
                    autoSelectedRef.current = null;
                  }
                }}
                onEdit={() => onEditAccount(account)}
                onDelete={() => onDeleteAccount(account)}
              />
            ))}
          </div>
          {/* Separator */}
          <div className="mx-auto my-1 w-6 border-t border-black/[0.08] dark:border-white/[0.08]" />
          {/* Folders via AppSidebar-style items */}
          <AppSidebar
            sections={folderSections}
            activeKey={selectedFolderId ?? undefined}
            onSelect={onSelectFolder}
            collapsed
            className="!w-full !border-r-0"
          />
        </div>
        <div className="shrink-0 border-t border-black/[0.06] px-1 py-1 dark:border-white/[0.08]">
          {collapsedFooter}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden border-r border-border-base bg-[var(--sidebar-bg)] select-none"
      style={{ width: 188 }}
    >
      <div className="flex flex-1 flex-col overflow-y-auto px-2 pt-3">
        {/* Accounts section */}
        <div className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
          {t("mail.sidebar.accounts")}
        </div>
        {accounts.map((account, i) => (
          <AccountItem
            key={account.id}
            account={account}
            colorIndex={i}
            isSelected={selectedAccountId === account.id}
            onSelect={() => {
              if (account.id !== selectedAccountId) {
                onSelectAccount(account.id);
                autoSelectedRef.current = null;
              }
            }}
            onEdit={() => onEditAccount(account)}
            onDelete={() => onDeleteAccount(account)}
          />
        ))}
        {/* Folders section via AppSidebar */}
        {folderSections.length > 0 && (
          <div className="mt-1">
            <AppSidebar
              sections={folderSections}
              activeKey={selectedFolderId ?? undefined}
              onSelect={onSelectFolder}
              className="!w-full !border-r-0 !bg-transparent !pt-0"
            />
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-black/[0.06] px-2 py-2 dark:border-white/[0.08]">
        {fullFooter}
      </div>
    </div>
  );
}
