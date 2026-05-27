import type { ShellApi } from "@tokimo/sdk";
import type { MailAccountOutput } from "./generated/rust-api/mail";

interface AccountSetupBridge {
  kind: "account-setup";
  shell: ShellApi;
  locale: string;
  onComplete: (createdId: string) => void;
}

interface ComposerBridge {
  kind: "composer";
  shell: ShellApi;
  locale: string;
  onSent?: () => void;
}

interface AccountEditBridge {
  kind: "account-edit";
  shell: ShellApi;
  locale: string;
  account: MailAccountOutput;
  onSaved: () => void;
}

export type ModalBridge =
  | AccountSetupBridge
  | ComposerBridge
  | AccountEditBridge;

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
