import type { ShellApi } from "@tokimo/sdk";
import type { ComponentType } from "react";

export interface AppModalWindowHandle {
  id: string;
  metadata: Record<string, unknown>;
  close: () => void;
}

export interface AppModalWindowParams {
  component: () => Promise<{
    default: ComponentType<{ win: AppModalWindowHandle }>;
  }>;
  title?: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}

type ShellWithModal = ShellApi & {
  openModalWindow?: (params: AppModalWindowParams) => string;
  windowManager?: {
    openModalWindow?: (params: AppModalWindowParams) => string;
  };
};

export function openShellModalWindow(
  shell: ShellApi,
  params: AppModalWindowParams,
): string | null {
  const candidate = shell as ShellWithModal;
  if (typeof candidate.openModalWindow === "function") {
    return candidate.openModalWindow(params);
  }
  if (typeof candidate.windowManager?.openModalWindow === "function") {
    return candidate.windowManager.openModalWindow(params);
  }
  console.warn("[mail] shell.openModalWindow is unavailable; modal skipped.");
  return null;
}
