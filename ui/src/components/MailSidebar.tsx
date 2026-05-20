import { useQueryClient } from "@tanstack/react-query";
import {
  AppSidebar,
  type AppSidebarFooterAction,
  type AppSidebarItem,
  type AppSidebarSection,
  Badge,
  type ContextMenuItem,
  MaterialFileIcon,
  Spin,
  useContextMenu,
} from "@tokimo/ui";
import {
  AlertCircle,
  Archive,
  Inbox,
  Pencil,
  Plus,
  Send,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "../i18n";
import { mailApi } from "../generated/rust-api";
import type {
  MailAccountOutput,
  MailFolderOutput,
} from "../generated/rust-api/mail";
import { useWs } from "../lib/ws";
import type { ShellApi } from "@tokimo/sdk";

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

const ACCOUNT_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
];

const ACCOUNT_KEY_PREFIX = "account:";

function AccountAvatar({
  account,
  colorIndex,
}: {
  account: MailAccountOutput;
  colorIndex: number;
}) {
  const color = ACCOUNT_COLORS[colorIndex % ACCOUNT_COLORS.length];
  const initial = (account.displayName || account.email)[0].toUpperCase();
  return (
    <div
      className="flex size-7 items-center justify-center rounded-lg text-[11px] font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  );
}

function AccountUnreadBadge({ accountId }: { accountId: string }) {
  const { data } = mailApi.listFolders.useQuery({ accountId });
  const unread = useMemo(
    () =>
      (data ?? []).reduce((s, f) => s + (f as MailFolderOutput).unreadCount, 0),
    [data],
  );
  if (unread <= 0) return null;
  return (
    <Badge
      count={unread}
      size="small"
      overflowCount={Number.POSITIVE_INFINITY}
    />
  );
}

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
  shell?: ShellApi;
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
  shell,
}: MailSidebarProps) {
  const { t } = useTranslation();
  const folderQuery = mailApi.listFolders.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId },
  );
  const folders = (folderQuery.data ?? []) as MailFolderOutput[];

  const queryClient = useQueryClient();
  const ws = useWs(shell);
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
      const key = mailApi.listFolders.queryKey({
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

  useEffect(() => {
    return ws.subscribe("mail:folder_counts", (msg) => {
      const data = msg.data as {
        accountId: string;
        folders: { folderId: string; unreadCount: number }[];
      };
      const key = mailApi.listFolders.queryKey({ accountId: data.accountId });
      queryClient.setQueryData<MailFolderOutput[]>(key, (old) => {
        if (!old) return old;
        const countMap = new Map(
          data.folders.map((f) => [f.folderId, f.unreadCount]),
        );
        return old.map((f) => {
          const count = countMap.get(f.id);
          return count !== undefined ? { ...f, unreadCount: count } : f;
        });
      });
    });
  }, [ws, queryClient]);

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

  const ctxMenu = useContextMenu();

  const buildAccountMenu = (account: MailAccountOutput): ContextMenuItem[] => [
    {
      key: "edit",
      label: t("mail.account.editAccount"),
      icon: <Settings className="size-3.5" />,
      onClick: () => onEditAccount(account),
    },
    { type: "divider" },
    {
      key: "delete",
      label: t("mail.account.deleteAccount"),
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      onClick: () => onDeleteAccount(account),
    },
  ];

  const accountItems: AppSidebarItem[] = accounts.map((account, i) => ({
    key: ACCOUNT_KEY_PREFIX + account.id,
    icon: <AccountAvatar account={account} colorIndex={i} />,
    label: account.displayName || account.email,
    tooltip: account.displayName || account.email,
    extra: <AccountUnreadBadge accountId={account.id} />,
    onContextMenu: (e) => ctxMenu.open(e, buildAccountMenu(account)),
  }));

  const folderItems: AppSidebarItem[] = folderQuery.isLoading
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
        tooltip: folder.name,
        extra:
          folder.unreadCount > 0 ? (
            <Badge
              count={folder.unreadCount}
              size="small"
              overflowCount={Number.POSITIVE_INFINITY}
            />
          ) : undefined,
      }));

  const sections: AppSidebarSection[] = [
    {
      key: "accounts",
      variant: "tall",
      items: accountItems,
    },
    ...(selectedAccountId && folderItems.length > 0
      ? [
          {
            key: "folders",
            label: t("mail.sidebar.folders"),
            items: folderItems,
          },
        ]
      : []),
  ];

  // Folder is the primary selection (gets the sliding indicator); account
  // tags along as a secondary highlight via activeKeys.
  const activeKey = selectedFolderId ?? undefined;
  const activeKeys = selectedAccountId
    ? [ACCOUNT_KEY_PREFIX + selectedAccountId]
    : undefined;

  const handleSelect = (key: string) => {
    if (key.startsWith(ACCOUNT_KEY_PREFIX)) {
      const id = key.slice(ACCOUNT_KEY_PREFIX.length);
      if (id !== selectedAccountId) {
        onSelectAccount(id);
        autoSelectedRef.current = null;
      }
      return;
    }
    onSelectFolder(key);
  };

  const footerActions: AppSidebarFooterAction[] = [
    {
      key: "compose",
      icon: <Pencil className="size-4" />,
      label: t("mail.sidebar.compose"),
      variant: "primary",
      onClick: onCompose,
    },
    {
      key: "add-account",
      icon: <Plus className="size-4" />,
      label: t("mail.sidebar.addAccount"),
      onClick: onAddAccount,
    },
  ];

  return (
    <>
      <AppSidebar
        sections={sections}
        activeKey={activeKey}
        activeKeys={activeKeys}
        onSelect={handleSelect}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapse}
        footerActions={footerActions}
        collapseLabel={t("mail.sidebar.collapseSidebar")}
        expandLabel={t("mail.sidebar.expandSidebar")}
        width={188}
      />
      {ctxMenu.contextMenu}
    </>
  );
}
