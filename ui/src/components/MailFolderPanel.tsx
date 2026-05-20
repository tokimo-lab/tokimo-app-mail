import { Badge, cn, MaterialFileIcon, ScrollArea, Spin } from "@tokimo/ui";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Inbox,
  Pencil,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { mailApi } from "../generated/rust-api";
import type { MailFolderOutput } from "../generated/rust-api/mail";

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
  important: AlertTriangle,
};

function getFolderIconElement(folderType: string, folderName: string) {
  const Icon =
    SPECIAL_FOLDER_ICONS[folderType] ??
    SPECIAL_FOLDER_ICONS[folderName.toLowerCase()];
  if (Icon) {
    return <Icon className="size-4 shrink-0" />;
  }
  return <MaterialFileIcon name={folderName} isDirectory size={16} />;
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
  const { data, isLoading } = mailApi.listFolders.useQuery(
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
                {getFolderIconElement(folder.folderType, folder.name)}
                <span className="truncate">{folder.name}</span>
                {folder.unreadCount > 0 && (
                  <Badge
                    count={folder.unreadCount}
                    size="small"
                    overflowCount={Number.POSITIVE_INFINITY}
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
