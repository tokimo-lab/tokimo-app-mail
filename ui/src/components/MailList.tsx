import { cn, ScrollArea, Spin } from "@tokiomo/components";
import { Paperclip, Star } from "lucide-react";
import { api } from "@/generated/rust-api";
import type { MailMessageSummaryOutput } from "@/generated/rust-api/mail";

interface MailListProps {
  accountId: string;
  folderId: string;
  selectedMessageId: string | null;
  onSelectMessage: (id: string) => void;
}

export function MailList({
  accountId,
  folderId,
  selectedMessageId,
  onSelectMessage,
}: MailListProps) {
  const { data, isLoading } = api.mail.listMessages.useQuery(
    { accountId, folderId, page: 1, pageSize: 50 },
    { enabled: !!accountId && !!folderId },
  );

  const messages = (data?.data?.messages ?? []) as MailMessageSummaryOutput[];
  const total = data?.data?.total ?? 0;

  if (isLoading) {
    return (
      <div className="flex w-80 shrink-0 items-center justify-center border-r border-border">
        <Spin className="size-5" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex w-80 shrink-0 items-center justify-center border-r border-border text-sm text-muted-foreground">
        No messages
      </div>
    );
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-medium text-foreground">
          {total} messages
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {messages.map((msg) => (
            <MessageRow
              key={msg.id}
              message={msg}
              isSelected={selectedMessageId === msg.id}
              onClick={() => onSelectMessage(msg.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function MessageRow({
  message,
  isSelected,
  onClick,
}: {
  message: MailMessageSummaryOutput;
  isSelected: boolean;
  onClick: () => void;
}) {
  const fromDisplay =
    message.from.length > 0
      ? message.from[0].name || message.from[0].address
      : "Unknown";

  const dateStr = message.date
    ? formatRelativeDate(new Date(message.date))
    : "";

  return (
    <button
      type="button"
      className={cn(
        "flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2 text-left transition-colors",
        isSelected ? "bg-primary/10" : "hover:bg-accent/50",
        !message.isRead && "bg-accent/30",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "truncate text-sm",
            !message.isRead
              ? "font-semibold text-foreground"
              : "text-foreground",
          )}
        >
          {fromDisplay}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {dateStr}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "truncate text-sm",
            !message.isRead
              ? "font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {message.subject || "(no subject)"}
        </span>
        {message.isFlagged && (
          <Star className="size-3 shrink-0 fill-yellow-400 text-yellow-400" />
        )}
        {message.hasAttachments && (
          <Paperclip className="size-3 shrink-0 text-muted-foreground" />
        )}
      </div>
      {message.preview && (
        <p className="truncate text-xs text-muted-foreground">
          {message.preview}
        </p>
      )}
    </button>
  );
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
