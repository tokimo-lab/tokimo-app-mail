import {
  Button,
  Form,
  Input,
  Modal,
  Spin,
  TextArea,
  useForm,
} from "@tokiomo/components";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";
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
  const [form] = useForm();
  const [showCcBcc, setShowCcBcc] = useState(false);

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
      msg.success("Message sent");
      onClose();
    },
    onError: (err) => {
      msg.error(`Failed to send: ${err.message}`);
    },
  });

  const handleSend = async () => {
    const values = form.getFieldsValue();
    const toAddrs = (values.to || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (toAddrs.length === 0) {
      msg.error("Please enter at least one recipient");
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
      to: toAddrs,
      cc: ccAddrs.length > 0 ? ccAddrs : undefined,
      bcc: bccAddrs.length > 0 ? bccAddrs : undefined,
      subject: values.subject || "",
      text_body: values.body || "",
      in_reply_to: replyMessage?.messageId ?? undefined,
      references: replyMessage?.references ?? undefined,
    });
  };

  return (
    <Modal
      open
      title={isReply ? "Reply" : "New Message"}
      onCancel={onClose}
      width={700}
      footer={
        <div className="flex items-center gap-2">
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
            Send
          </Button>
        </div>
      }
    >
      <Form form={form} layout="horizontal" labelCol={{ span: 1 }}>
        <div className="flex items-center gap-2">
          <Form.Item
            label="To"
            name="to"
            className="min-w-0 flex-1"
            rules={[{ required: true, message: "Recipient is required" }]}
          >
            <Input placeholder="recipient@example.com" />
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
            <Form.Item label="Cc" name="cc">
              <Input placeholder="cc@example.com" />
            </Form.Item>
            <Form.Item label="Bcc" name="bcc">
              <Input placeholder="bcc@example.com" />
            </Form.Item>
          </>
        )}

        <Form.Item label="Subject" name="subject">
          <Input placeholder="Subject" />
        </Form.Item>

        <Form.Item name="body" className="!mb-0">
          <TextArea
            placeholder="Write your message..."
            className="min-h-[300px] resize-none"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
