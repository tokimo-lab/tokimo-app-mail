import { Button, ScrollArea, Spin } from "@tokiomo/components";
import {
  ArrowLeft,
  Download,
  Forward,
  Paperclip,
  Reply,
  Trash2,
} from "lucide-react";
import { useRef } from "react";
import { api } from "@/generated/rust-api";
import type {
  MailAddressOutput,
  MailMessageFullOutput,
} from "@/generated/rust-api/mail";

interface MailViewerProps {
  messageId: string;
  onReply: (messageId: string) => void;
  onClose: () => void;
}

export function MailViewer({ messageId, onReply, onClose }: MailViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { data, isLoading } = api.mail.getMessage.useQuery(
    { messageId },
    { enabled: !!messageId },
  );
  const message = data?.data as MailMessageFullOutput | undefined;

  const markRead = api.mail.markRead.useMutation();
  const deleteMessages = api.mail.deleteMessages.useMutation({
    onSuccess: () => onClose(),
  });

  // Auto-mark as read when loaded.
  if (message && !message.isRead) {
    markRead.mutate({ message_ids: [message.id] });
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spin className="size-5" />
      </div>
    );
  }

  if (!message) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Message not found
      </div>
    );
  }

  const htmlContent =
    message.htmlBody || message.textBody?.replace(/\n/g, "<br>") || "";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          onClick={onClose}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          onClick={() => onReply(message.id)}
        >
          <Reply className="size-4" />
          <span className="ml-1">Reply</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          onClick={() => onReply(message.id)}
        >
          <Forward className="size-4" />
          <span className="ml-1">Forward</span>
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer text-destructive"
          onClick={() => deleteMessages.mutate({ message_ids: [message.id] })}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Subject */}
          <h2 className="text-lg font-semibold text-foreground">
            {message.subject || "(no subject)"}
          </h2>

          {/* From / To / Date */}
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">From:</span>
              <span className="text-foreground">
                {formatAddresses(message.from)}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">To:</span>
              <span className="text-foreground">
                {formatAddresses(message.to)}
              </span>
            </div>
            {message.cc.length > 0 && (
              <div className="flex gap-2">
                <span className="shrink-0 text-muted-foreground">Cc:</span>
                <span className="text-foreground">
                  {formatAddresses(message.cc)}
                </span>
              </div>
            )}
            {message.date && (
              <div className="flex gap-2">
                <span className="shrink-0 text-muted-foreground">Date:</span>
                <span className="text-foreground">
                  {new Date(message.date).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Attachments */}
          {message.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm"
                >
                  <Paperclip className="size-3.5 text-muted-foreground" />
                  <span className="text-foreground">{att.filename}</span>
                  <span className="text-xs text-muted-foreground">
                    ({formatSize(att.size)})
                  </span>
                  {att.data && (
                    <button
                      type="button"
                      className="cursor-pointer text-primary hover:text-primary/80"
                      onClick={() =>
                        downloadAttachment(
                          att.filename,
                          att.contentType,
                          att.data!,
                        )
                      }
                    >
                      <Download className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Body */}
          <div className="mt-4 border-t border-border pt-4">
            {message.htmlBody ? (
              <iframe
                ref={iframeRef}
                title="Email content"
                sandbox="allow-same-origin"
                className="w-full border-0"
                srcDoc={buildSafeHtml(htmlContent)}
                onLoad={() => {
                  // Auto-resize iframe to content height.
                  const iframe = iframeRef.current;
                  if (iframe?.contentDocument?.body) {
                    iframe.style.height = `${iframe.contentDocument.body.scrollHeight + 20}px`;
                  }
                }}
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-foreground">
                {message.textBody}
              </pre>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function formatAddresses(addrs: MailAddressOutput[]): string {
  return addrs
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
    .join(", ");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildSafeHtml(html: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; color: #1a1a1a; word-wrap: break-word; }
    img { max-width: 100%; height: auto; }
    a { color: #3b82f6; }
    table { max-width: 100%; }
  </style>
</head>
<body>${html}</body>
</html>`;
}

function downloadAttachment(
  filename: string,
  contentType: string,
  base64Data: string,
) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
