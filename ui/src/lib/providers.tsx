import { QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, ToastProvider, enUS as uiEnUS, zhCN as uiZhCN } from "@tokimo/ui";
import type { ReactNode } from "react";
import type { ShellToastApi } from "@tokimo/sdk";
import { TranslationProvider } from "../i18n";
import { queryClient } from "./query-client";
import { LocaleContext, ToastContext } from "./shell-context";

export function MailProviders({ locale, toast, children }: { locale: string; toast: ShellToastApi; children: ReactNode }) {
  const uiLocale = locale.startsWith("zh") ? uiZhCN : uiEnUS;
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleContext.Provider value={locale}>
        <ToastContext.Provider value={toast}>
          <TranslationProvider locale={locale}>
            <ConfigProvider locale={uiLocale}>
              <ToastProvider>{children}</ToastProvider>
            </ConfigProvider>
          </TranslationProvider>
        </ToastContext.Provider>
      </LocaleContext.Provider>
    </QueryClientProvider>
  );
}
