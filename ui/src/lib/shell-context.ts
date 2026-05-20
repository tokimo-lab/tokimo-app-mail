import type { ShellToastApi } from "@tokimo/sdk";
import { createContext, useContext } from "react";

const noopToast: ShellToastApi = {
  show: () => undefined,
  info: () => undefined,
  success: () => undefined,
  warning: () => undefined,
  error: () => undefined,
};

export const ToastContext = createContext<ShellToastApi>(noopToast);
export const LocaleContext = createContext("en-US");

export function useMessage(): ShellToastApi {
  return useContext(ToastContext);
}
