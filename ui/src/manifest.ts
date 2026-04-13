import { Mail } from "lucide-react";
import type { AppManifest } from "../_framework/types";

export const manifest: AppManifest = {
  id: "mail",
  category: "system",
  defaultSize: { width: 1200, height: 800 },
  singleton: true,
  fullBleed: true,
  icon: Mail,
  image: "/page-icons/mail.png",
  color: "#3b82f6",
  appName: "dashboard.menu.mail",
  order: 45,
  component: () => import("./pages/MailApp"),
};
