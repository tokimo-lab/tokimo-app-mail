/**
 * MailComposerWindow — modal window for composing / replying to emails.
 *
 * Opened via `openModalWindow()` from MailApp. Metadata:
 *   - `accountId: string`          — account to send from
 *   - `replyToMessageId?: string`  — if present, reply mode
 */

import { useWindowActions } from "@/system";
import type { WindowState } from "@/system/window/window-types";
import { MailComposer } from "./MailComposer";

export default function MailComposerWindow({ win }: { win: WindowState }) {
  const { closeWindow } = useWindowActions();

  const meta = win.metadata as Record<string, unknown>;
  const accountId = meta.accountId as string;
  const replyToMessageId = meta.replyToMessageId as string | undefined;

  return (
    <MailComposer
      accountId={accountId}
      replyToMessageId={replyToMessageId}
      onClose={() => closeWindow(win.id)}
    />
  );
}
