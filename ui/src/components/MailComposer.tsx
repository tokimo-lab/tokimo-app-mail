import {
  Button,
  Form,
  Input,
  ScrollArea,
  Select,
  Spin,
  TextArea,
  useForm,
} from "@tokimo/ui";
import { Paperclip, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/generated/rust-api";
import type { MailMessageFullOutput } from "@/generated/rust-api/mail";
import { useMessage } from "@/system/notifications/useMessage";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface MailAccountBrief {
  id: string;
  email: string;
  displayName: string;
}

interface MailComposerProps {
  accountId: string;
  accounts?: MailAccountBrief[];
  replyToMessageId?: string | null;
  mode?: "reply" | "forward";
  onClose: () => void;
}

export function MailComposer({
  accountId,
  accounts = [],
  replyToMessageId,
  mode,
  onClose,
}: MailComposerProps) {
  const msg = useMessage();
  const { t } = useTranslation();
  const [form] = useForm();
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [fromAccountId, setFromAccountId] = useState(accountId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

  // If replying, load the original message.
  const { data: replyData } = api.mail.getMessage.useQuery(
    { messageId: replyToMessageId! },
    { enabled: !!replyToMessageId },
  );
  const replyMessage = replyData as MailMessageFullOutput | undefined;

  // Pre-fill reply / forward fields.
  const hasOriginalMessage = !!replyToMessageId && !!replyMessage;
  useEffect(() => {
    if (!hasOriginalMessage || !replyMessage) return;
    const sub = replyMessage.subject || "";
    const fromAddr = replyMessage.from.map((a) => a.address).join(", ");
    const dateStr = replyMessage.date
      ? new Date(replyMessage.date).toLocaleString()
      : "";
    const originalBody = replyMessage.textBody || "";

    if (mode === "forward") {
      const fwdPrefix = t("mail.composer.subjectForwardPrefix");
      const fwdSub = sub.startsWith(fwdPrefix) ? sub : `${fwdPrefix} ${sub}`;
      const separator = t("mail.composer.forwardSeparator");
      const forwardedBody = [
        "",
        "",
        separator,
        `From: ${fromAddr}`,
        ...(dateStr ? [`Date: ${dateStr}`] : []),
        `Subject: ${sub}`,
        "",
        originalBody,
      ].join("\n");
      form.setFieldsValue({ to: "", subject: fwdSub, body: forwardedBody });
    } else {
      const replyAddr =
        replyMessage.replyTo.length > 0
          ? replyMessage.replyTo
          : replyMessage.from;
      const rePrefix = t("mail.composer.subjectReplyPrefix");
      const replySub = sub.startsWith(rePrefix) ? sub : `${rePrefix} ${sub}`;
      const quotedHeader = t("mail.composer.replyQuotedHeader", {
        date: dateStr,
        from: fromAddr,
      });
      const quotedBody = originalBody
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      form.setFieldsValue({
        to: replyAddr.map((a) => a.address).join(", "),
        subject: replySub,
        body: `\n\n${quotedHeader}\n${quotedBody}`,
      });
    }
  }, [hasOriginalMessage, replyMessage, form, mode, t]);

  const sendMutation = api.mail.sendMessage.useMutation({
    onSuccess: () => {
      msg.success(t("mail.composer.messageSent"));
      onClose();
    },
    onError: (err) => {
      msg.error(t("mail.composer.sendFailed", { error: err.message }));
    },
  });

  const handleAddAttachments = (files: FileList | null) => {
    if (!files) return;
    const next = [...attachments, ...Array.from(files)];
    const totalBytes = next.reduce((sum, f) => sum + f.size, 0);
    const oversized = next.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) {
      msg.error(
        t("mail.composer.attachmentTooLarge", { name: oversized.name }),
      );
      return;
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      msg.error(t("mail.composer.attachmentsTooLarge"));
      return;
    }
    setAttachments(next);
  };

  const handleSend = async () => {
    const values = form.getFieldsValue();
    const toAddrs = (values.to || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (toAddrs.length === 0) {
      msg.error(t("mail.composer.recipientRequired"));
      return;
    }

    const ccAddrs = (values.cc || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    const bccAddrs = (values.bcc || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    sendMutation.mutate({
      accountId: fromAccountId,
      payload: {
        to: toAddrs,
        cc: ccAddrs.length > 0 ? ccAddrs : undefined,
        bcc: bccAddrs.length > 0 ? bccAddrs : undefined,
        subject: values.subject || "",
        text_body: values.body || "",
        in_reply_to: replyMessage?.messageId ?? undefined,
        references: replyMessage?.references ?? undefined,
      },
      attachments,
    });
  };

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1" direction="vertical">
        <div className="p-4">
          <Form form={form} layout="horizontal" labelCol={{ span: 1 }}>
            {/* From selector — only shown when multiple accounts */}
            {accounts.length > 1 && (
              <Form.Item label={t("mail.composer.from")} name="from">
                <Select
                  value={fromAccountId}
                  onChange={(v) => setFromAccountId(v as string)}
                  options={accounts.map((a) => ({
                    value: a.id,
                    label: a.displayName
                      ? `${a.displayName} <${a.email}>`
                      : a.email,
                  }))}
                />
              </Form.Item>
            )}
            <div className="flex items-center gap-2">
              <Form.Item
                label={t("mail.composer.to")}
                name="to"
                className="min-w-0 flex-1"
                rules={[
                  {
                    required: true,
                    message: t("mail.composer.recipientRequired"),
                  },
                ]}
              >
                <Input placeholder={t("mail.composer.toPlaceholder")} />
              </Form.Item>
              {!showCcBcc && (
                <button
                  type="button"
                  className="mb-5 cursor-pointer text-xs text-fg-muted hover:text-fg-primary"
                  onClick={() => setShowCcBcc(true)}
                >
                  Cc/Bcc
                </button>
              )}
            </div>

            {showCcBcc && (
              <>
                <Form.Item label={t("mail.composer.cc")} name="cc">
                  <Input placeholder={t("mail.composer.ccPlaceholder")} />
                </Form.Item>
                <Form.Item label={t("mail.composer.bcc")} name="bcc">
                  <Input placeholder={t("mail.composer.bccPlaceholder")} />
                </Form.Item>
              </>
            )}

            <Form.Item label={t("mail.composer.subject")} name="subject">
              <Input placeholder={t("mail.composer.subjectPlaceholder")} />
            </Form.Item>

            <Form.Item name="body" className="!mb-0">
              <TextArea
                placeholder={t("mail.composer.bodyPlaceholder")}
                className="min-h-[300px] resize-none"
              />
            </Form.Item>
          </Form>
        </div>
      </ScrollArea>

      {/* Attachment chips — always visible above footer */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border-base px-4 py-2 max-h-[120px] overflow-y-auto">
          {attachments.map((file, i) => (
            <div
              key={`${file.name}-${file.size}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-3 py-1 text-xs text-fg-primary"
            >
              <Paperclip className="size-3 shrink-0" />
              <span className="max-w-[180px] truncate">{file.name}</span>
              <span className="text-fg-muted">{formatBytes(file.size)}</span>
              <button
                type="button"
                className="cursor-pointer text-fg-muted hover:text-fg-primary"
                onClick={() => {
                  const idx = i;
                  setAttachments((prev) => prev.filter((_, j) => j !== idx));
                }}
                aria-label={t("mail.composer.removeAttachment")}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-border-base px-4 py-3">
        <Button
          className="cursor-pointer"
          onClick={handleSend}
          disabled={sendMutation.isPending}
        >
          {sendMutation.isPending ? (
            <Spin className="mr-2 size-4" />
          ) : (
            <Send className="mr-2 size-4" />
          )}
          {t("mail.composer.send")}
        </Button>
        <button
          type="button"
          className="relative cursor-pointer text-fg-muted hover:text-fg-primary"
          onClick={() => fileInputRef.current?.click()}
          title={t("mail.composer.addAttachment")}
        >
          <Paperclip className="size-4" />
          {attachments.length > 0 && (
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-fg-primary text-[10px] font-semibold text-bg-base">
              {attachments.length}
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleAddAttachments(e.target.files)}
        />
      </div>
    </div>
  );
}
