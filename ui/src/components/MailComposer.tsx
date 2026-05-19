import {
  Button,
  Form,
  Input,
  ScrollArea,
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

interface MailComposerProps {
  accountId: string;
  replyToMessageId?: string | null;
  onClose: () => void;
}

export function MailComposer({
  accountId,
  replyToMessageId,
  onClose,
}: MailComposerProps) {
  const msg = useMessage();
  const { t } = useTranslation();
  const [form] = useForm();
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

  // If replying, load the original message.
  const { data: replyData } = api.mail.getMessage.useQuery(
    { messageId: replyToMessageId! },
    { enabled: !!replyToMessageId },
  );
  const replyMessage = replyData as MailMessageFullOutput | undefined;

  // Pre-fill reply fields.
  const isReply = !!replyToMessageId && !!replyMessage;
  useEffect(() => {
    if (!isReply || !replyMessage) return;
    const replyAddr =
      replyMessage.replyTo.length > 0
        ? replyMessage.replyTo
        : replyMessage.from;
    const sub = replyMessage.subject || "";
    form.setFieldsValue({
      to: replyAddr.map((a) => a.address).join(", "),
      subject: sub.startsWith("Re:") ? sub : `Re: ${sub}`,
    });
  }, [isReply, replyMessage, form]);

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
      accountId,
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

            {/* Attachment list */}
            {attachments.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {attachments.map((file, i) => (
                  <div
                    key={`${file.name}-${file.size}`}
                    className="flex items-center gap-2 rounded bg-bg-subtle px-2 py-1 text-xs text-fg-muted"
                  >
                    <Paperclip className="size-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <button
                      type="button"
                      className="cursor-pointer text-fg-muted hover:text-fg-primary"
                      onClick={() => {
                        const idx = i;
                        setAttachments((prev) =>
                          prev.filter((_, j) => j !== idx),
                        );
                      }}
                      aria-label={t("mail.composer.removeAttachment")}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Form>
        </div>
      </ScrollArea>

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
          className="cursor-pointer text-fg-muted hover:text-fg-primary"
          onClick={() => fileInputRef.current?.click()}
          title={t("mail.composer.addAttachment")}
        >
          <Paperclip className="size-4" />
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
