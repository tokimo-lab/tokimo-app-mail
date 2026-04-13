import { Badge, cn, ScrollArea, Spin } from "@tokiomo/components";
import {
  AlertCircle,
  Archive,
  Folder,
  Inbox,
  Pencil,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { api } from "@/generated/rust-api";
import type { MailFolderOutput } from "@/generated/rust-api/mail";

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

interface MailFolderPanelProps {
  accountId: string | null;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
}

export function MailFolderPanel({
  accountId,
  selectedFolderId,
  onSelectFolder,
}: MailFolderPanelProps) {
  const { data, isLoading } = api.mail.listFolders.useQuery(
    { accountId: accountId! },
    { enabled: !!accountId },
  );
  const folders = (data ?? []) as MailFolderOutput[];

  // Auto-select inbox when folders load.
  const autoSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedFolderId || !accountId) return;
    if (folders.length === 0) return;
    if (autoSelectedRef.current === accountId) return;
    const inbox = folders.find((f) => f.folderType === "inbox");
    const target = inbox ?? folders[0];
    autoSelectedRef.current = accountId;
    onSelectFolder(target.id);
  }, [accountId, selectedFolderId, folders, onSelectFolder]);

  if (!accountId) {
    return (
      <div className="flex h-full w-44 shrink-0 items-center justify-center border-r border-border-base">
        <span className="text-sm text-fg-muted">Select an account</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full w-44 shrink-0 items-center justify-center border-r border-border-base">
        <Spin className="size-5" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-44 shrink-0 flex-col border-r border-border-base">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-1.5">
          {folders.map((folder) => {
            const Icon = getFolderIcon(folder.folderType, folder.name);
            const isActive = selectedFolderId === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => onSelectFolder(folder.id)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-accent-subtle text-fg-primary font-medium"
                    : "text-fg-secondary hover:bg-black/[0.04] dark:hover:bg-white/[0.04]",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{folder.name}</span>
                {folder.unreadCount > 0 && (
                  <Badge
                    count={folder.unreadCount}
                    size="small"
                    className="ml-auto"
                  />
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
