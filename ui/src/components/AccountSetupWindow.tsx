/**
 * AccountSetupWindow — modal window for adding a new mail account.
 *
 * Opened via `openModalWindow()` from MailApp.
 */

import { useWindowActions } from "@/system";
import type { WindowState } from "@/system/window/window-types";
import { AccountSetup } from "./AccountSetup";

export default function AccountSetupWindow({ win }: { win: WindowState }) {
  const { closeWindow } = useWindowActions();

  return (
    <AccountSetup
      onComplete={() => closeWindow(win.id)}
      onCancel={() => closeWindow(win.id)}
    />
  );
}
