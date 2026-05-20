import type { ShellApi } from "@tokimo/sdk";
import { useMemo } from "react";

type WsMessage<T = unknown> = { data: T };
type SubscribeFn = (
  eventType: string,
  handler: (msg: WsMessage) => void,
) => () => void;

type ShellWithWs = ShellApi & { ws?: { subscribe?: SubscribeFn } };

function hasWs(shell: ShellApi): shell is ShellWithWs {
  const candidate = shell as ShellWithWs;
  return typeof candidate.ws?.subscribe === "function";
}

export function useWs(shell?: ShellApi): { subscribe: SubscribeFn } {
  return useMemo(
    () => ({
      subscribe: (eventType, handler) => {
        if (shell && hasWs(shell))
          return shell.ws.subscribe(eventType, handler);
        return () => undefined;
      },
    }),
    [shell],
  );
}
