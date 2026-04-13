import { Button, Empty, ScrollArea, Spin, Tooltip } from "@tokiomo/components";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  Download,
  Forward,
  Mail,
  Paperclip,
  Reply,
  Trash2,
} from "lucide-react";
import { useEffect, useRef } from "react";
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
  const shadowHostRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = api.mail.getMessage.useQuery(
    { messageId },
    { enabled: !!messageId },
  );
  const message = data as MailMessageFullOutput | undefined;

  const { mutate: markReadMutate } = api.mail.markRead.useMutation();
  const deleteMessages = api.mail.deleteMessages.useMutation({
    onSuccess: () => onClose(),
  });

  // Auto-mark as read when loaded.
  const msgId = message?.id;
  const isRead = message?.isRead;
  useEffect(() => {
    if (msgId && !isRead) {
      markReadMutate({ message_ids: [msgId] });
    }
  }, [msgId, isRead, markReadMutate]);

  // Render sanitized HTML into Shadow DOM for CSS isolation
  const htmlContent =
    message?.htmlBody || message?.textBody?.replace(/\n/g, "<br>") || "";
  useEffect(() => {
    const host = shadowHostRef.current;
    if (!host || !message?.htmlBody) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.innerHTML = buildShadowContent(sanitizeHtml(htmlContent));
  }, [htmlContent, message?.htmlBody]);

  if (isLoading) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <Spin className="size-5" />
      </div>
    );
  }

  if (!message) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <Empty
          image={<Mail className="size-10 stroke-1" />}
          description="Message not found"
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border-base px-3 py-2">
        <Tooltip title="Back">
          <Button
            variant="text"
            size="small"
            className="cursor-pointer"
            onClick={onClose}
          >
            <ArrowLeft className="size-4" />
          </Button>
        </Tooltip>
        <Tooltip title="Reply">
          <Button
            variant="text"
            size="small"
            className="cursor-pointer"
            onClick={() => onReply(message.id)}
          >
            <Reply className="size-4" />
            <span className="ml-1">Reply</span>
          </Button>
        </Tooltip>
        <Tooltip title="Forward">
          <Button
            variant="text"
            size="small"
            className="cursor-pointer"
            onClick={() => onReply(message.id)}
          >
            <Forward className="size-4" />
            <span className="ml-1">Forward</span>
          </Button>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip title="Delete">
          <Button
            variant="text"
            size="small"
            className="cursor-pointer text-red-500"
            onClick={() => deleteMessages.mutate({ message_ids: [message.id] })}
          >
            <Trash2 className="size-4" />
          </Button>
        </Tooltip>
      </div>

      <ScrollArea className="shrink-0 max-h-[45%]" direction="vertical">
        <div className="p-4">
          {/* Subject */}
          <h2 className="text-lg font-semibold text-fg-primary">
            {message.subject || "(no subject)"}
          </h2>

          {/* From / To / Date */}
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="shrink-0 text-fg-muted">From:</span>
              <span className="min-w-0 break-all text-fg-primary">
                {formatAddresses(message.from)}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="shrink-0 text-fg-muted">To:</span>
              <span className="min-w-0 break-all text-fg-primary">
                {formatAddresses(message.to)}
              </span>
            </div>
            {message.cc.length > 0 && (
              <div className="flex gap-2">
                <span className="shrink-0 text-fg-muted">Cc:</span>
                <span className="min-w-0 break-all text-fg-primary">
                  {formatAddresses(message.cc)}
                </span>
              </div>
            )}
            {message.date && (
              <div className="flex gap-2">
                <span className="shrink-0 text-fg-muted">Date:</span>
                <span className="text-fg-primary">
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
                  className="flex items-center gap-1.5 rounded-md border border-border-base px-2 py-1 text-sm"
                >
                  <Paperclip className="size-3.5 text-fg-muted" />
                  <span className="text-fg-primary">{att.filename}</span>
                  <span className="text-xs text-fg-muted">
                    ({formatSize(att.size)})
                  </span>
                  {att.data && (
                    <button
                      type="button"
                      className="cursor-pointer text-accent hover:text-accent-hover"
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
        </div>
      </ScrollArea>

      {/* Body — fills remaining height */}
      <div className="flex min-h-0 flex-1 flex-col border-t border-border-base">
        {message.htmlBody ? (
          <ScrollArea className="flex-1" direction="vertical">
            <div ref={shadowHostRef} className="min-h-0" />
          </ScrollArea>
        ) : message.textBody ? (
          <ScrollArea className="flex-1" direction="vertical">
            <pre className="whitespace-pre-wrap break-words p-4 text-sm text-fg-primary">
              {message.textBody}
            </pre>
          </ScrollArea>
        ) : (
          <p className="p-4 text-sm text-fg-muted italic">
            No content available
          </p>
        )}
      </div>
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

/**
 * Parse a CSS color string to [r, g, b] (0-255).
 * Handles: hex (#rgb, #rrggbb), rgb(), rgba(), named black/white/transparent.
 * Returns null for unrecognised values (gradient, currentColor, var(), etc.).
 */
function parseColorRGB(raw: string): [number, number, number] | null {
  const s = raw.trim().toLowerCase();
  if (s === "black") return [0, 0, 0];
  if (s === "white" || s === "transparent") return [255, 255, 255];

  const hex3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (hex3) {
    return [
      Number.parseInt(hex3[1] + hex3[1], 16),
      Number.parseInt(hex3[2] + hex3[2], 16),
      Number.parseInt(hex3[3] + hex3[3], 16),
    ];
  }
  const hex6 = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (hex6) {
    return [
      Number.parseInt(hex6[1], 16),
      Number.parseInt(hex6[2], 16),
      Number.parseInt(hex6[3], 16),
    ];
  }
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];

  return null;
}

/** Perceived luminance 0-1. */
function luminance(rgb: [number, number, number]): number {
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}

/**
 * Sanitize HTML email content with DOMPurify.
 *
 * Security:
 * - Strips <script>, <iframe>, <object>, <embed>, <form>, <meta>, etc.
 * - Removes all on* event handler attributes
 * - Blocks javascript:/data: URIs (except data: on <img>)
 * - Forces target="_blank" rel="noopener noreferrer" on all links
 *
 * Theme adaptation:
 * - Strips inline color if dark (luminance < 0.25) → falls back to --text-primary
 * - Strips inline background-color if light (luminance > 0.85) → transparent
 * - Preserves intentional brand/accent colors
 */
function sanitizeHtml(html: string): string {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    // Force safe link targets
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }

    // Neutralise "theme-bound" inline colors so the app theme takes over
    if (node instanceof HTMLElement && node.style) {
      const color = node.style.color;
      if (color) {
        const rgb = parseColorRGB(color);
        if (rgb && luminance(rgb) < 0.25) {
          node.style.removeProperty("color");
        }
      }

      const bg = node.style.backgroundColor;
      if (bg) {
        const rgb = parseColorRGB(bg);
        if (rgb && luminance(rgb) > 0.85) {
          node.style.removeProperty("background-color");
        }
      }

      // Shorthand "background" — only strip if it's a plain light colour
      const bgShort = node.style.background;
      if (bgShort) {
        const rgb = parseColorRGB(bgShort);
        if (rgb && luminance(rgb) > 0.85) {
          node.style.removeProperty("background");
        }
      }
    }
  });

  const clean = DOMPurify.sanitize(html, {
    ADD_TAGS: ["style"],
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "textarea",
      "select",
      "button",
      "meta",
      "link",
      "base",
      "applet",
      "math",
      "svg",
    ],
    FORBID_ATTR: [
      "onerror",
      "onload",
      "onclick",
      "onmouseover",
      "onfocus",
      "onblur",
      "onsubmit",
      "onreset",
      "onchange",
      "oninput",
      "onkeydown",
      "onkeyup",
      "onkeypress",
      "onmousedown",
      "onmouseup",
      "onmousemove",
      "onmouseout",
      "ondblclick",
      "oncontextmenu",
      "ondrag",
      "ondragstart",
      "ondragend",
      "ondragover",
      "ondragenter",
      "ondragleave",
      "ondrop",
      "onanimationstart",
      "onanimationend",
      "ontransitionend",
      "onpointerdown",
      "onpointerup",
      "onpointermove",
      "ontouchstart",
      "ontouchend",
      "ontouchmove",
      "onwheel",
      "onscroll",
      "onresize",
      "formaction",
      "xlink:href",
    ],
    ALLOW_DATA_ATTR: false,
    ADD_DATA_URI_TAGS: ["img"],
  });

  DOMPurify.removeAllHooks();
  return clean;
}

/**
 * Also strip dark text colors / light backgrounds from <style> blocks
 * embedded in the email HTML. This handles stylesheet rules like
 * `body { color: #000; background: #fff; }`.
 */
function neutralizeStyleBlock(css: string): string {
  // Remove color declarations with dark values
  return css
    .replace(
      /\bcolor\s*:\s*(#0{3,6}|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))\s*(;|(?=\}))/gi,
      "color: inherit;",
    )
    .replace(
      /\bbackground(-color)?\s*:\s*(#f{3,6}|white|#fafafa|#f5f5f5|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))\s*(;|(?=\}))/gi,
      "background-color: transparent;",
    );
}

function buildShadowContent(sanitizedHtml: string): string {
  // Neutralise <style> blocks within the email
  const processed = sanitizedHtml.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_, open, css, close) => `${open}${neutralizeStyleBlock(css)}${close}`,
  );

  return `<style>
  :host { display: block; }
  .mail-body { margin: 0; padding: 8px 16px; background: transparent; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: var(--text-primary); word-wrap: break-word; overflow-wrap: break-word; }
  .mail-body img { max-width: 100%; height: auto; }
  .mail-body a { color: var(--accent); }
  .mail-body table { max-width: 100% !important; border-collapse: collapse; }
  .mail-body pre { white-space: pre-wrap; word-wrap: break-word; max-width: 100%; overflow-x: auto; }
  .mail-body blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid var(--border-base); color: var(--text-muted); }
  .mail-body * { box-sizing: border-box; }
  .mail-body hr { border-color: var(--border-base); }
</style>
<div class="mail-body">${processed}</div>`;
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
