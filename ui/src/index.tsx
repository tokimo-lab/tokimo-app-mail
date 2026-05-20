import { type AppRuntimeCtx, type Dispose, defineApp } from "@tokimo/sdk";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { translations } from "./i18n";
import { MailApp } from "./MailApp";
import "./index.css";
import { MailProviders } from "./lib/providers";

export default defineApp({
  id: "mail",
  manifest: {
    id: "mail",
    appName: "Mail",
    icon: "Mail",
    image: "icon.png",
    color: "#3b82f6",
    windowType: "mail",
    defaultSize: { width: 1200, height: 800 },
    category: "system",
  },
  translations,
  mount(container: HTMLElement, ctx: AppRuntimeCtx): Dispose {
    const root: Root = createRoot(container);
    root.render(
      <StrictMode>
        <MailProviders locale={ctx.locale} toast={ctx.shell.toast}>
          <MailApp ctx={ctx} />
        </MailProviders>
      </StrictMode>,
    );
    return () => root.unmount();
  },
});
