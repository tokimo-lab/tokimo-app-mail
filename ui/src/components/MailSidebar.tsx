import { Badge, Button, cn, ScrollArea, Spin, Tooltip } from "@tokiomo/components";
import {
  AlertCircle,
  Archive,
  ChevronDown,
  ChevronRight,
  Folder,
  Inbox,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
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

interface MailSidebarProps {
  accounts: MailAccountOutput[];
  selectedAccountId: string | null;
  selectedFolderId: string | null;
  onSelectAccount: (id: string) => void;
  onSelectFolder: (id: string) => void;
  onAddAccount: () => void;
  onCompose: () => void;
}

export function MailSidebar({
  accounts,
  selectedAccountId,
  selectedFolderId,
  onSelectAccount,
  onSelectFolder,
  onAddAccount,
  onCompose,
}: MailSidebarProps) {
  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-border-base bg-[var(--sidebar-bg)] select-none">
      {/* Compose button */}
      <div className="shrink-0 border-b border-black/[0.06] px-3 pt-4 pb-3 dark:border-white/[0.08]">
        <Button className="w-full cursor-pointer" onClick={onCompose}>
          <Pencil className="mr-2 size-4" />
          Compose
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pt-3">
          {accounts.map((account, i) => (
            <AccountSection
              key={account.id}
              account={account}
              isSelected={selectedAccountId === account.id}
              selectedFolderId={selectedFolderId}
              onSelectAccount={onSelectAccount}
              onSelectFolder={onSelectFolder}
              showSeparator={i > 0}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Add account */}
      <div className="shrink-0 border-t border-black/[0.06] px-2 py-2 dark:border-white/[0.08]">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-accent-subtle hover:text-accent"
          onClick={onAddAccount}
        >
          <Plus className="size-3.5" />
          Add account
        </button>
      </div>
    </div>
  );
}

function AccountSection({
  account,
  isSelected,
  selectedFolderId,
  onSelectAccount,
  onSelectFolder,
  showSeparator,
}: {
  account: MailAccountOutput;
  isSelected: boolean;
  selectedFolderId: string | null;
  onSelectAccount: (id: string) => void;
  onSelectFolder: (id: string) => void;
  showSeparator: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const { data: foldersData, isLoading: foldersLoading } =
    api.mail.listFolders.useQuery(
      { accountId: account.id },
      { enabled: expanded },
    );
  const folders = (foldersData?.data ?? []) as MailFolderOutput[];

  const syncFolders = api.mail.syncFolders.useMutation();

  return (
    <div>
      {showSeparator && (
        <div className="my-1 mx-3 border-t border-black/[0.06] dark:border-white/[0.08]" />
      )}

      {/* Account header */}
      <div
        className={cn(
          "mb-0.5 flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
          isSelected
            ? "bg-black/[0.06] font-medium text-fg-primary dark:bg-white/[0.06]"
            : "text-fg-muted hover:bg-black/[0.06] dark:hover:bg-white/[0.06]",
        )}
      >
        <button
          type="button"
          className="flex flex-1 cursor-pointer items-center gap-1.5"
          onClick={() => {
            onSelectAccount(account.id);
            setExpanded(!expanded);
          }}
        >
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          <Mail className="size-3.5 shrink-0" />
          <span className="truncate">
            {account.displayName || account.email}
          </span>
        </button>
        <Tooltip title="Sync folders" placement="right">
          <button
            type="button"
            className="cursor-pointer rounded p-0.5 text-fg-muted transition-colors hover:text-fg-primary"
            onClick={(e) => {
              e.stopPropagation();
              syncFolders.mutate({ accountId: account.id });
            }}
          >
            <RefreshCw
              className={cn("size-3", syncFolders.isPending && "animate-spin")}
            />
          </button>
        </Tooltip>
      </div>

      {/* Folder list */}
      {expanded && (
        <div className="ml-3 mt-0.5">
          {foldersLoading ? (
            <div className="flex items-center justify-center py-2">
              <Spin className="size-4" />
            </div>
          ) : (
            folders.map((folder) => {
              const Icon = getFolderIcon(folder.folderType, folder.name);
              return (
                <button
                  key={folder.id}
                  type="button"
                  className={cn(
                    "mb-0.5 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    selectedFolderId === folder.id
                      ? "bg-accent-subtle font-medium text-accent"
                      : "text-fg-muted hover:bg-black/[0.06] dark:hover:bg-white/[0.06]",
                  )}
                  onClick={() => onSelectFolder(folder.id)}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="flex-1 truncate text-left">
                    {folder.name}
                  </span>
                  {folder.unreadCount > 0 && (
                    <Badge count={folder.unreadCount} size="small" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
