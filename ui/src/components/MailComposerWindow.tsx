import type { ShellWindowHandle } from "@tokimo/sdk";
import { useState } from "react";
import { MailProviders } from "../lib/providers";
import { clearBridge, getBridge } from "../modal-bridge";
import type { MailAccountBrief } from "./MailComposer";
import { MailComposer } from "./MailComposer";

function readString(meta: Record<string, unknown>, key: string): string | undefined {
  const value = meta[key];
  return typeof value === "string" ? value : undefined;
}

function readMode(meta: Record<string, unknown>): "reply" | "forward" | undefined {
  const value = meta.mode;
  return value === "reply" || value === "forward" ? value : undefined;
}

function isAccountBrief(value: unknown): value is MailAccountBrief {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.displayName === "string"
  );
}

function readAccounts(meta: Record<string, unknown>): MailAccountBrief[] {
  const value = meta.accounts;
  return Array.isArray(value) ? value.filter(isAccountBrief) : [];
}

export default function MailComposerWindow({ win }: { win: ShellWindowHandle }) {
  const meta = win.metadata;
  const bridgeId = readString(meta, "bridgeId");
  const [bridge] = useState(() => (bridgeId ? getBridge(bridgeId) : undefined));
  const accountId = readString(meta, "accountId");

  if (!bridgeId || bridge?.kind !== "composer" || !accountId) return null;

  return (
    <MailProviders locale={bridge.locale} toast={bridge.shell.toast}>
      <MailComposer
        accountId={accountId}
        replyToMessageId={readString(meta, "replyToMessageId")}
        mode={readMode(meta)}
        accounts={readAccounts(meta)}
        onClose={() => {
          bridge.onSent?.();
          clearBridge(bridgeId);
          win.close();
        }}
      />
    </MailProviders>
  );
}
