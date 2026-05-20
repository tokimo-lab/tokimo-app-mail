import { useQueryClient } from "@tanstack/react-query";
import type { AppRuntimeCtx } from "@tokimo/sdk";
import { useShellMenuBar } from "@tokimo/sdk/react";
import { Button, Empty, Modal, Spin } from "@tokimo/ui";
import { Inbox, Mail, Plus, Send } from "lucide-react";
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccountEditDialog } from "./components/AccountEditDialog";
import { MailList } from "./components/MailList";
import { MailSidebar } from "./components/MailSidebar";
import { MailViewer } from "./components/MailViewer";
import { mailApi } from "./generated/rust-api";
import type { MailAccountOutput } from "./generated/rust-api/mail";
import { useMailAccounts } from "./hooks/useMailAccounts";
import { useTranslation } from "./i18n";
import { openShellModalWindow } from "./lib/modal-window";
import { useContainerWidth } from "./lib/use-container-width";
import { registerBridge } from "./modal-bridge";

interface MailSetupGuideFeature {
  icon?: ComponentType<{ className?: string }>;
  label: string;
}

function MailSetupGuide({
  title,
  description,
  features,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  features: MailSetupGuideFeature[];
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-border-base bg-bg-base/80 p-8 text-center shadow-sm">
        <img src="icon.png" alt="" className="mx-auto mb-5 size-16" />
        <h1 className="text-xl font-semibold text-text-base">{title}</h1>
        <p className="mt-2 text-sm text-text-muted">{description}</p>
        <div className="mt-6 space-y-3 text-left">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              {Icon ? <Icon className="size-4 text-blue-500" /> : null}
              <span>{label}</span>
            </div>
          ))}
        </div>
        <Button
          className="mt-7"
          variant="primary"
          icon={<Plus className="size-4" />}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

export function MailApp({ ctx }: { ctx: AppRuntimeCtx }) {
  const { t } = useTranslation();
  const {
    accounts,
    isLoading: accountsLoading,
    refetch: refetchAccounts,
  } = useMailAccounts();
  const msg = ctx.shell.toast;
  const qc = useQueryClient();
  const [editingAccount, setEditingAccount] =
    useState<MailAccountOutput | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [containerRef, containerWidth] = useContainerWidth();
  const [manuallyCollapsed, setManuallyCollapsed] = useState<boolean | null>(
    null,
  );
  const sidebarCollapsed =
    manuallyCollapsed ?? (containerWidth > 0 && containerWidth < 720);

  const activeAccountId =
    selectedAccountId ?? (accounts.length > 0 ? accounts[0].id : null);
  const didAutoSelect = useRef(false);

  useEffect(() => {
    if (
      !didAutoSelect.current &&
      !selectedAccountId &&
      activeAccountId &&
      !accountsLoading
    ) {
      didAutoSelect.current = true;
      setSelectedAccountId(activeAccountId);
    }
  }, [selectedAccountId, activeAccountId, accountsLoading]);

  const accountBriefs = useMemo(
    () =>
      accounts.map((a) => ({
        id: a.id,
        email: a.email,
        displayName: a.displayName,
      })),
    [accounts],
  );

  const handleSelectAccount = useCallback((id: string) => {
    setSelectedAccountId(id);
    setSelectedFolderId(null);
    setSelectedMessageId(null);
  }, []);

  const handleSelectFolder = useCallback((id: string) => {
    setSelectedFolderId(id);
    setSelectedMessageId(null);
  }, []);

  const deleteMessageMutation = mailApi.deleteMessages.useMutation({
    onSuccess: (_data, vars) => {
      const id = vars.message_ids[0];
      if (selectedMessageId === id) setSelectedMessageId(null);
      if (activeAccountId) {
        qc.invalidateQueries({
          queryKey: mailApi.listFolders.queryKey({
            accountId: activeAccountId,
          }),
        });
      }
      msg.success(t("mail.viewer.deleteSuccess"));
    },
    onError: (err) =>
      msg.error(t("mail.viewer.deleteFailed", { error: err.message })),
  });

  const openComposer = useCallback(
    (options?: { mode?: "reply" | "forward"; replyToMessageId?: string }) => {
      if (!activeAccountId) return;
      const bridgeId = registerBridge({
        kind: "composer",
        shell: ctx.shell,
        locale: ctx.locale,
        onSent: () => {
          if (activeAccountId && selectedFolderId) {
            qc.invalidateQueries({
              queryKey: mailApi.listMessages.queryKey({
                accountId: activeAccountId,
                folderId: selectedFolderId,
                page: 1,
                pageSize: 50,
              }),
            });
          }
        },
      });
      openShellModalWindow(ctx.shell, {
        component: () => import("./components/MailComposerWindow"),
        title:
          options?.mode === "reply"
            ? t("mail.composer.reply")
            : options?.mode === "forward"
              ? t("mail.composer.forward")
              : t("mail.composer.newMessage"),
        width: 700,
        height: 560,
        metadata: {
          bridgeId,
          accountId: activeAccountId,
          replyToMessageId: options?.replyToMessageId,
          mode: options?.mode,
          accounts: accountBriefs,
        },
      });
    },
    [
      accountBriefs,
      activeAccountId,
      ctx.locale,
      ctx.shell,
      qc,
      selectedFolderId,
      t,
    ],
  );

  const handleAddAccount = useCallback(() => {
    const bridgeId = registerBridge({
      kind: "account-setup",
      shell: ctx.shell,
      locale: ctx.locale,
      onComplete: (id) => {
        setSelectedAccountId(id);
        setSelectedFolderId(null);
        setSelectedMessageId(null);
        void refetchAccounts();
      },
    });
    openShellModalWindow(ctx.shell, {
      component: () => import("./components/AccountSetupWindow"),
      title: t("mail.setup.addAccount"),
      width: 640,
      height: 600,
      metadata: { bridgeId },
    });
  }, [ctx.locale, ctx.shell, refetchAccounts, t]);

  const deleteAccountMutation = mailApi.deleteAccount.useMutation({
    onSuccess: () => {
      msg.success(t("mail.account.deleteSuccess"));
      mailApi.listAccounts.invalidate(qc);
      void refetchAccounts();
      setSelectedAccountId(null);
      setSelectedFolderId(null);
      setSelectedMessageId(null);
    },
    onError: (err) =>
      msg.error(t("mail.account.deleteFailed", { error: err.message })),
  });

  const handleDeleteAccount = useCallback(
    (account: MailAccountOutput) => {
      Modal.confirm({
        title: t("mail.account.deleteAccount"),
        content: t("mail.account.confirmDelete", { email: account.email }),
        okType: "danger",
        okText: t("mail.account.deleteAccount"),
        cancelText: t("mail.setup.cancel"),
        onOk: () => deleteAccountMutation.mutate(account.id),
      });
    },
    [deleteAccountMutation, t],
  );

  useShellMenuBar(
    ctx,
    useMemo(
      () => ({
        menus: [
          {
            key: "mail",
            label: t("mail.app.title"),
            items: [
              {
                key: "compose",
                label: t("mail.sidebar.compose"),
                onClick: () => openComposer(),
              },
              {
                key: "add-account",
                label: t("mail.sidebar.addAccount"),
                onClick: handleAddAccount,
              },
            ],
          },
        ],
        about: { description: "Tokimo Mail", version: "0.1.0" },
      }),
      [handleAddAccount, openComposer, t],
    ),
  );

  if (accountsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <MailSetupGuide
        title={t("common.setupGuide.getStarted", { name: "Mail" })}
        description={t("common.setupGuide.mailTagline")}
        features={t("common.setupGuide.mailFeatures", {
          returnObjects: true,
        }).map((label, i) => ({ icon: [Plus, Inbox, Send][i], label }))}
        actionLabel={t("common.setupGuide.mailAction")}
        onAction={handleAddAccount}
      />
    );
  }

  return (
    <>
      <div ref={containerRef} className="flex h-full overflow-hidden">
        <MailSidebar
          accounts={accounts}
          selectedAccountId={activeAccountId}
          selectedFolderId={selectedFolderId}
          collapsed={sidebarCollapsed}
          onSelectAccount={handleSelectAccount}
          onSelectFolder={handleSelectFolder}
          onAddAccount={handleAddAccount}
          onCompose={() => openComposer()}
          onToggleCollapse={() =>
            setManuallyCollapsed((v) => !(v ?? sidebarCollapsed))
          }
          onEditAccount={setEditingAccount}
          onDeleteAccount={handleDeleteAccount}
          shell={ctx.shell}
        />

        {activeAccountId && selectedFolderId ? (
          <MailList
            accountId={activeAccountId}
            folderId={selectedFolderId}
            selectedMessageId={selectedMessageId}
            onSelectMessage={setSelectedMessageId}
            shell={ctx.shell}
          />
        ) : (
          <div className="flex w-72 shrink-0 items-center justify-center border-r border-border-base">
            <Empty
              image={<Mail className="size-10 stroke-1" />}
              description={t("mail.app.selectFolder")}
            />
          </div>
        )}

        {selectedMessageId ? (
          <MailViewer
            messageId={selectedMessageId}
            onReply={(messageId) =>
              openComposer({ mode: "reply", replyToMessageId: messageId })
            }
            onForward={(messageId) =>
              openComposer({ mode: "forward", replyToMessageId: messageId })
            }
            onDelete={(id) =>
              deleteMessageMutation.mutate({ message_ids: [id] })
            }
            onClose={() => setSelectedMessageId(null)}
          />
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <Empty
              image={<Mail className="size-10 stroke-1" />}
              description={
                selectedFolderId
                  ? t("mail.app.selectMessage")
                  : t("mail.app.selectFolderFirst")
              }
            />
          </div>
        )}
      </div>

      {editingAccount && (
        <AccountEditDialog
          account={editingAccount}
          open={true}
          onClose={() => setEditingAccount(null)}
        />
      )}
    </>
  );
}
