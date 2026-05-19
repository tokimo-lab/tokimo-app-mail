/**
 * MailComposerWindow — modal window for composing / replying / forwarding emails.
 *
 * Opened via `openModalWindow()` from MailApp. Metadata:
 *   - `accountId: string`             — account to send from
 *   - `replyToMessageId?: string`     — message being replied to or forwarded
 *   - `mode?: "reply" | "forward"`    — compose mode
 *   - `accounts?: MailAccountBrief[]` — all accounts for From selector
 */

import { useWindowActions } from "@/system";
import type { WindowState } from "@/system/window/window-types";
import type { MailAccountBrief } from "./MailComposer";
import { MailComposer } from "./MailComposer";

export default function MailComposerWindow({ win }: { win: WindowState }) {
  const { closeWindow } = useWindowActions();

  const meta = win.metadata as Record<string, unknown>;
  const accountId = meta.accountId as string;
  const replyToMessageId = meta.replyToMessageId as string | undefined;
  const mode = meta.mode as "reply" | "forward" | undefined;
  const accounts = (meta.accounts as MailAccountBrief[] | undefined) ?? [];

  return (
    <MailComposer
      accountId={accountId}
      replyToMessageId={replyToMessageId}
      mode={mode}
      accounts={accounts}
      onClose={() => closeWindow(win.id)}
    />
  );
}
