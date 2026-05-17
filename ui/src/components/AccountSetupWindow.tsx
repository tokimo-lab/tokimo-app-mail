/**
 * AccountSetupWindow — modal window for adding a new mail account.
 *
 * Opened via `openModalWindow()` from MailApp.
 */

import { useWindowActions } from "@/system";
import type { WindowState } from "@/system/window/window-types";
import { emitPick } from "@/system/window-bridge";
import { AccountSetup } from "./AccountSetup";

export default function AccountSetupWindow({ win }: { win: WindowState }) {
  const { closeWindow } = useWindowActions();

  return (
    <AccountSetup
      onComplete={(id) => {
        emitPick(win, { id });
        closeWindow(win.id);
      }}
      onCancel={() => closeWindow(win.id)}
    />
  );
}
