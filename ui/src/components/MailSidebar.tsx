import {
  AppSidebar,
  type AppSidebarSection,
  Badge,
  Spin,
  Tooltip,
} from "@tokiomo/components";
import {
  AlertCircle,
  Archive,
  Folder,
  Inbox,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { api } from "@/generated/rust-api";
import type {
  MailAccountOutput,
  MailFolderOutput,
} from "@/generated/rust-api/mail";

const FOLDER_ICONS: Record<string, typeof Inbox> = {
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

function getFolderIcon(folderType: string, folderName: string) {
  const Icon =
    FOLDER_ICONS[folderType] ??
    FOLDER_ICONS[folderName.toLowerCase()] ??
    Folder;
  return Icon;
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
}: MailSidebarProps) {
  // Fetch folders only for the selected account.
  const folderQuery = api.mail.listFolders.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId },
  );
  const folders = (folderQuery.data ?? []) as MailFolderOutput[];

  const syncMutation = api.mail.triggerSync.useMutation();

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

  // ── Build sidebar sections ──────────────────────────────────────────────

  const sections: AppSidebarSection[] = useMemo(() => {
    // Section 1: Mail accounts (like video libraries)
    const accountSection: AppSidebarSection = {
      items: accounts.map((account, i) => ({
        key: account.id,
        icon: (
          <div
            className="flex size-7 items-center justify-center rounded-lg text-[11px] font-semibold text-white"
            style={{
              backgroundColor: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
            }}
          >
            {(account.displayName || account.email)[0].toUpperCase()}
          </div>
        ),
        label: account.displayName || account.email,
      })),
    };

    // Section 2: Folders of selected account
    if (!selectedAccountId || folders.length === 0) {
      return [accountSection];
    }

    const folderSection: AppSidebarSection = {
      label: "Folders",
      items: folderQuery.isLoading
        ? [
            {
              key: "folders-loading",
              icon: <Spin className="size-4" />,
              label: "Loading...",
            },
          ]
        : folders.map((folder) => {
            const Icon = getFolderIcon(folder.folderType, folder.name);
            return {
              key: folder.id,
              icon: <Icon className="size-4" />,
              label: folder.name,
              extra:
                folder.unreadCount > 0 ? (
                  <Badge count={folder.unreadCount} size="small" />
                ) : undefined,
            };
          }),
    };

    return [accountSection, folderSection];
  }, [accounts, selectedAccountId, folders, folderQuery.isLoading]);

  // ── Selection handler ───────────────────────────────────────────────────

  const handleSelect = (key: string) => {
    // Check if this key is an account ID.
    const isAccount = accounts.some((a) => a.id === key);
    if (isAccount) {
      if (key !== selectedAccountId) {
        onSelectAccount(key);
        autoSelectedRef.current = null;
      }
    } else {
      onSelectFolder(key);
    }
  };

  // ── Active key: prefer folder, otherwise account ────────────────────────
  const activeKey = selectedFolderId ?? selectedAccountId ?? undefined;

  // ── Footer ──────────────────────────────────────────────────────────────

  const collapsedFooter = (
    <div className="flex flex-col items-center gap-1">
      <Tooltip title="Compose" placement="right">
        <button
          type="button"
          onClick={onCompose}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <Pencil className="size-4" />
        </button>
      </Tooltip>
      <Tooltip title="Add account" placement="right">
        <button
          type="button"
          onClick={onAddAccount}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <Plus className="size-4" />
        </button>
      </Tooltip>
      {selectedAccountId && (
        <Tooltip title="Sync" placement="right">
          <button
            type="button"
            onClick={() => syncMutation.mutate(selectedAccountId)}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
          >
            <RefreshCw
              className={`size-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
            />
          </button>
        </Tooltip>
      )}
      <Tooltip title="Expand sidebar" placement="right">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <PanelLeft className="size-4" />
        </button>
      </Tooltip>
    </div>
  );

  const fullFooter = (
    <div className="flex items-center gap-1">
      <Tooltip title="Compose">
        <button
          type="button"
          onClick={onCompose}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <Pencil className="size-4" />
        </button>
      </Tooltip>
      <Tooltip title="Add account">
        <button
          type="button"
          onClick={onAddAccount}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <Plus className="size-4" />
        </button>
      </Tooltip>
      {selectedAccountId && (
        <Tooltip title="Sync">
          <button
            type="button"
            onClick={() => syncMutation.mutate(selectedAccountId)}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
          >
            <RefreshCw
              className={`size-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
            />
          </button>
        </Tooltip>
      )}
      <Tooltip title="Collapse sidebar">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ml-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </Tooltip>
    </div>
  );

  return (
    <AppSidebar
      sections={sections}
      activeKey={activeKey}
      onSelect={handleSelect}
      collapsed={collapsed}
      footer={collapsed ? collapsedFooter : fullFooter}
    />
  );
}
