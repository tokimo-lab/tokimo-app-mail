import { useQueryClient } from "@tanstack/react-query";
import { Empty, Modal, Spin } from "@tokimo/ui";
import { Mail } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/generated/rust-api";
import type { MailAccountOutput } from "@/generated/rust-api/mail";
import { useContainerWidth } from "@/shared/hooks/use-container-width";
import { useSidebarCollapsed } from "@/shared/hooks/use-sidebar-collapsed";
import { useWindowActions, useWindowId } from "@/system";
import { useMessage } from "@/system/notifications/useMessage";
import { useWindowNav } from "@/system/window/WindowNavContext";
import type { TaskMetadata } from "@/system/window/window-types";
import { AccountEditDialog } from "../components/AccountEditDialog";
import { AccountSetup } from "../components/AccountSetup";
import { MailList } from "../components/MailList";
import { MailSidebar } from "../components/MailSidebar";
import { MailViewer } from "../components/MailViewer";
import { useMailAccounts } from "../hooks/useMailAccounts";

export default function MailApp() {
  const { t } = useTranslation();
  const {
    accounts,
    isLoading: accountsLoading,
    refetch: refetchAccounts,
  } = useMailAccounts();
  const msg = useMessage();
  const qc = useQueryClient();

  const [editingAccount, setEditingAccount] =
    useState<MailAccountOutput | null>(null);

  const [containerRef, containerWidth] = useContainerWidth();
  const { collapsed: sidebarCollapsed, onToggleCollapse } = useSidebarCollapsed(
    "mail",
    containerWidth > 0 && containerWidth < 720,
  );

  const { metadata, updateMetadata } = useWindowNav();

  const selectedAccountId = (metadata.mailAccountId as string) ?? null;
  const selectedFolderId = (metadata.mailFolderId as string) ?? null;
  const selectedMessageId = (metadata.mailMessageId as string) ?? null;

  const windowId = useWindowId();
  const { openModalWindow } = useWindowActions();

  // Auto-select first account if none is persisted.
  const activeAccountId =
    selectedAccountId ?? (accounts.length > 0 ? accounts[0].id : null);

  // Persist activeAccountId on first load when auto-selected.
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (
      !didAutoSelect.current &&
      !selectedAccountId &&
      activeAccountId &&
      !accountsLoading
    ) {
      didAutoSelect.current = true;
      updateMetadata({
        mailAccountId: activeAccountId,
      } as Partial<TaskMetadata>);
    }
  }, [selectedAccountId, activeAccountId, accountsLoading, updateMetadata]);

  const handleSelectAccount = useCallback(
    (id: string) => {
      updateMetadata({
        mailAccountId: id,
        mailFolderId: undefined,
        mailMessageId: undefined,
      } as Partial<TaskMetadata>);
    },
    [updateMetadata],
  );

  const handleSelectFolder = useCallback(
    (id: string) => {
      updateMetadata({
        mailFolderId: id,
        mailMessageId: undefined,
      } as Partial<TaskMetadata>);
    },
    [updateMetadata],
  );

  const handleSelectMessage = useCallback(
    (id: string) => {
      updateMetadata({ mailMessageId: id } as Partial<TaskMetadata>);
    },
    [updateMetadata],
  );

  const handleDeleteMessage = useCallback(
    (id: string) => {
      if (selectedMessageId === id) {
        updateMetadata({ mailMessageId: undefined } as Partial<TaskMetadata>);
      }
    },
    [selectedMessageId, updateMetadata],
  );

  const handleReply = useCallback(
    (messageId: string) => {
      if (!activeAccountId) return;
      openModalWindow({
        component: () => import("../components/MailComposerWindow"),
        parentWindowId: windowId,
        title: t("mail.composer.reply"),
        width: 700,
        height: 560,
        noResize: true,
        noMinimize: true,
        metadata: {
          accountId: activeAccountId,
          replyToMessageId: messageId,
        } as Record<string, unknown> as TaskMetadata,
      });
    },
    [activeAccountId, openModalWindow, windowId, t],
  );

  const handleCompose = useCallback(() => {
    if (!activeAccountId) return;
    openModalWindow({
      component: () => import("../components/MailComposerWindow"),
      parentWindowId: windowId,
      title: t("mail.composer.newMessage"),
      width: 700,
      height: 560,
      noResize: true,
      noMinimize: true,
      metadata: {
        accountId: activeAccountId,
      } as Record<string, unknown> as TaskMetadata,
    });
  }, [activeAccountId, openModalWindow, windowId, t]);

  const deleteAccountMutation = api.mail.deleteAccount.useMutation({
    onSuccess: () => {
      msg.success(t("mail.account.deleteSuccess"));
      api.mail.listAccounts.invalidate(qc);
      refetchAccounts();
    },
    onError: (err) => {
      msg.error(t("mail.account.deleteFailed", { error: err.message }));
    },
  });

  const handleEditAccount = useCallback((account: MailAccountOutput) => {
    setEditingAccount(account);
  }, []);

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
    [t, deleteAccountMutation],
  );

  const handleAddAccount = useCallback(() => {
    openModalWindow({
      component: () => import("../components/AccountSetupWindow"),
      parentWindowId: windowId,
      title: t("mail.setup.addAccount"),
      width: 640,
      height: 600,
      noResize: true,
      noMinimize: true,
    });
  }, [openModalWindow, windowId, t]);

  if (accountsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    );
  }

  // No accounts configured — show setup inline.
  if (accounts.length === 0) {
    return <AccountSetup onComplete={() => {}} />;
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
          onCompose={handleCompose}
          onToggleCollapse={onToggleCollapse}
          onEditAccount={handleEditAccount}
          onDeleteAccount={handleDeleteAccount}
        />

        {/* Message list */}
        {activeAccountId && selectedFolderId ? (
          <MailList
            accountId={activeAccountId}
            folderId={selectedFolderId}
            selectedMessageId={selectedMessageId}
            onSelectMessage={handleSelectMessage}
            onDeleteMessage={handleDeleteMessage}
          />
        ) : (
          <div className="flex w-72 shrink-0 items-center justify-center border-r border-border-base">
            <Empty
              image={<Mail className="size-10 stroke-1" />}
              description={t("mail.app.selectFolder")}
            />
          </div>
        )}

        {/* Message detail */}
        {selectedMessageId ? (
          <MailViewer
            messageId={selectedMessageId}
            onReply={handleReply}
            onClose={() =>
              updateMetadata({
                mailMessageId: undefined,
              } as Partial<TaskMetadata>)
            }
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

      {/* Account edit dialog */}
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
