import { Button, Input, Spin, TextArea } from "@tokiomo/components";
import { Send, X } from "lucide-react";
import { useState } from "react";
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
  const message = useMessage();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);

  // If replying, load the original message.
  const { data: replyData } = api.mail.getMessage.useQuery(
    { messageId: replyToMessageId! },
    { enabled: !!replyToMessageId },
  );
  const replyMessage = replyData?.data as MailMessageFullOutput | undefined;

  // Pre-fill reply fields.
  const isReply = !!replyToMessageId && !!replyMessage;
  if (isReply && !to) {
    const replyAddr =
      replyMessage.replyTo.length > 0
        ? replyMessage.replyTo
        : replyMessage.from;
    if (replyAddr.length > 0) {
      setTo(replyAddr.map((a) => a.address).join(", "));
    }
    if (!subject) {
      const sub = replyMessage.subject || "";
      setSubject(sub.startsWith("Re:") ? sub : `Re: ${sub}`);
    }
  }

  const sendMutation = api.mail.sendMessage.useMutation({
    onSuccess: () => {
      message.success("Message sent");
      onClose();
    },
    onError: (err) => {
      message.error(`Failed to send: ${err.message}`);
    },
  });

  const handleSend = () => {
    const toAddrs = to
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (toAddrs.length === 0) {
      message.error("Please enter at least one recipient");
      return;
    }

    const ccAddrs = cc
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const bccAddrs = bcc
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    sendMutation.mutate({
      accountId,
      to: toAddrs,
      cc: ccAddrs.length > 0 ? ccAddrs : undefined,
      bcc: bccAddrs.length > 0 ? bccAddrs : undefined,
      subject,
      text_body: body,
      in_reply_to: replyMessage?.messageId ?? undefined,
      references: replyMessage?.references ?? undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex h-[600px] w-[700px] flex-col rounded-lg border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            {isReply ? "Reply" : "New Message"}
          </h3>
          <button
            type="button"
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="space-y-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-sm text-muted-foreground">
              To:
            </span>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1"
            />
            {!showCcBcc && (
              <button
                type="button"
                className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowCcBcc(true)}
              >
                Cc/Bcc
              </button>
            )}
          </div>

          {showCcBcc && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-sm text-muted-foreground">
                  Cc:
                </span>
                <Input
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-sm text-muted-foreground">
                  Bcc:
                </span>
                <Input
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="bcc@example.com"
                  className="flex-1"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-sm text-muted-foreground">
              Sub:
            </span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-4 py-3">
          <TextArea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            className="h-full w-full resize-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
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
          <div className="flex-1" />
        </div>
      </div>
    </div>
  );
}
