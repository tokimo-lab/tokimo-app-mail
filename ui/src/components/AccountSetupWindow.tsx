import { useState } from "react";
import type { AppModalWindowHandle } from "../lib/modal-window";
import { MailProviders } from "../lib/providers";
import { clearBridge, getBridge } from "../modal-bridge";
import { AccountSetup } from "./AccountSetup";

function getBridgeId(win: AppModalWindowHandle): string | null {
  const value = win.metadata.bridgeId;
  return typeof value === "string" ? value : null;
}

export default function AccountSetupWindow({
  win,
}: {
  win: AppModalWindowHandle;
}) {
  const bridgeId = getBridgeId(win);
  const [bridge] = useState(() => (bridgeId ? getBridge(bridgeId) : undefined));

  if (!bridgeId || bridge?.kind !== "account-setup") return null;

  return (
    <MailProviders locale={bridge.locale} toast={bridge.shell.toast}>
      <AccountSetup
        onComplete={(id) => {
          bridge.onComplete(id);
          clearBridge(bridgeId);
          win.close();
        }}
        onCancel={() => {
          clearBridge(bridgeId);
          win.close();
        }}
      />
    </MailProviders>
  );
}
