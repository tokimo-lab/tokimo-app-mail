import { Button, cn, ScrollArea, Spin } from "@tokiomo/components";
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
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-background">
      {/* Compose button */}
      <div className="p-3">
        <Button className="w-full cursor-pointer" onClick={onCompose}>
          <Pencil className="mr-2 size-4" />
          Compose
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {accounts.map((account) => (
            <AccountSection
              key={account.id}
              account={account}
              isSelected={selectedAccountId === account.id}
              selectedFolderId={selectedFolderId}
              onSelectAccount={onSelectAccount}
              onSelectFolder={onSelectFolder}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Add account */}
      <div className="border-t border-border p-2">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onAddAccount}
        >
          <Plus className="size-4" />
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
}: {
  account: MailAccountOutput;
  isSelected: boolean;
  selectedFolderId: string | null;
  onSelectAccount: (id: string) => void;
  onSelectFolder: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const { data: foldersData, isLoading: foldersLoading } =
    api.mail.listFolders.useQuery(
      { accountId: account.id },
      { enabled: expanded },
    );
  const folders = (foldersData?.data ?? []) as MailFolderOutput[];

  const syncFolders = api.mail.syncFolders.useMutation({
    onSuccess: () => {
      api.mail.listFolders.invalidate(
        api.mail.listFolders.queryKey({ accountId: account.id }),
      );
    },
  });

  return (
    <div className="mb-1">
      {/* Account header */}
      <button
        type="button"
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium",
          isSelected
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
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
        <span className="truncate">{account.displayName || account.email}</span>
        <button
          type="button"
          className="ml-auto cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            syncFolders.mutate({ accountId: account.id });
          }}
          title="Sync folders"
        >
          <RefreshCw
            className={cn("size-3", syncFolders.isPending && "animate-spin")}
          />
        </button>
      </button>

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
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm",
                    selectedFolderId === folder.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                  onClick={() => onSelectFolder(folder.id)}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                  {folder.unreadCount > 0 && (
                    <span className="ml-auto text-xs font-medium text-primary">
                      {folder.unreadCount}
                    </span>
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
