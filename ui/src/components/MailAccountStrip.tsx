import { cn, Tooltip } from "@tokiomo/components";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import { api } from "@/generated/rust-api";
import type { MailAccountOutput } from "@/generated/rust-api/mail";

const ACCOUNT_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
];

interface MailAccountStripProps {
  accounts: MailAccountOutput[];
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
  onAddAccount: () => void;
  onCompose: () => void;
}

export function MailAccountStrip({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onAddAccount,
  onCompose,
}: MailAccountStripProps) {
  const syncMutation = api.mail.triggerSync.useMutation();

  return (
    <div className="flex h-full w-14 shrink-0 flex-col items-center border-r border-border-base py-2">
      {/* Account icons */}
      <div className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        {accounts.map((account, i) => {
          const color = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
          const isActive = account.id === selectedAccountId;
          const initial = (account.displayName ||
            account.email)[0].toUpperCase();

          return (
            <Tooltip
              key={account.id}
              title={account.displayName || account.email}
              placement="right"
            >
              <button
                type="button"
                onClick={() => onSelectAccount(account.id)}
                className={cn(
                  "flex size-10 cursor-pointer items-center justify-center rounded-xl transition-all",
                  isActive
                    ? "bg-accent-subtle ring-2 ring-accent"
                    : "hover:bg-black/[0.06] dark:hover:bg-white/[0.06]",
                )}
              >
                <div
                  className="flex size-8 items-center justify-center rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: color }}
                >
                  {initial}
                </div>
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col items-center gap-1 pt-2">
        {selectedAccountId && (
          <Tooltip title="Sync" placement="right">
            <button
              type="button"
              onClick={() => syncMutation.mutate(selectedAccountId)}
              className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  syncMutation.isPending && "animate-spin",
                )}
              />
            </button>
          </Tooltip>
        )}
        <Tooltip title="Compose" placement="right">
          <button
            type="button"
            onClick={onCompose}
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
          >
            <Pencil className="size-4" />
          </button>
        </Tooltip>
        <Tooltip title="Add account" placement="right">
          <button
            type="button"
            onClick={onAddAccount}
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
          >
            <Plus className="size-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
