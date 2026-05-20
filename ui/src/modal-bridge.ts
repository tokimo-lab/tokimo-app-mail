import type { ShellApi } from "@tokimo/sdk";

interface AccountSetupBridge {
  kind: "account-setup";
  shell: ShellApi;
  locale: string;
  onComplete: (createdId: string) => void;
}

export type ModalBridge = AccountSetupBridge;

const registry = new Map<string, ModalBridge>();
let counter = 0;

export function registerBridge(bridge: ModalBridge): string {
  counter += 1;
  const id = `mail-bridge-${Date.now()}-${counter}`;
  registry.set(id, bridge);
  return id;
}

export function getBridge(id: string): ModalBridge | undefined {
  return registry.get(id);
}

export function clearBridge(id: string): void {
  registry.delete(id);
}
