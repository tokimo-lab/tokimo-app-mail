import { Empty, Spin } from "@tokiomo/components";
import { Mail } from "lucide-react";
import { useCallback, useState } from "react";
import { useContainerWidth } from "@/shared/hooks/use-container-width";
import { useSidebarCollapsed } from "@/shared/hooks/use-sidebar-collapsed";
import { AccountSetup } from "../components/AccountSetup";
import { MailComposer } from "../components/MailComposer";
import { MailList } from "../components/MailList";
import { MailSidebar } from "../components/MailSidebar";
import { MailViewer } from "../components/MailViewer";
import { useMailAccounts } from "../hooks/useMailAccounts";

export default function MailApp() {
  const { accounts, isLoading: accountsLoading } = useMailAccounts();

  const [containerRef, containerWidth] = useContainerWidth();
  const { collapsed: sidebarCollapsed, onToggleCollapse } = useSidebarCollapsed(
    "mail",
    containerWidth > 0 && containerWidth < 720,
  );

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [showComposer, setShowComposer] = useState(false);
  const [showAccountSetup, setShowAccountSetup] = useState(false);
  const [composerReplyTo, setComposerReplyTo] = useState<string | null>(null);

  // Auto-select first account if none selected.
  const activeAccountId =
    selectedAccountId ?? (accounts.length > 0 ? accounts[0].id : null);

  const handleSelectAccount = useCallback((id: string) => {
    setSelectedAccountId(id);
    setSelectedFolderId(null);
    setSelectedMessageId(null);
  }, []);

  const handleSelectFolder = useCallback((id: string) => {
    setSelectedFolderId(id);
    setSelectedMessageId(null);
  }, []);

  const handleReply = useCallback((messageId: string) => {
    setComposerReplyTo(messageId);
    setShowComposer(true);
  }, []);

  const handleCompose = useCallback(() => {
    setComposerReplyTo(null);
    setShowComposer(true);
  }, []);

  if (accountsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    );
  }

  // No accounts configured — show setup.
  if (accounts.length === 0 || showAccountSetup) {
    return (
      <AccountSetup
        onComplete={() => setShowAccountSetup(false)}
        onCancel={
          accounts.length > 0 ? () => setShowAccountSetup(false) : undefined
        }
      />
    );
  }

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      <MailSidebar
        accounts={accounts}
        selectedAccountId={activeAccountId}
        selectedFolderId={selectedFolderId}
        collapsed={sidebarCollapsed}
        onSelectAccount={handleSelectAccount}
        onSelectFolder={handleSelectFolder}
        onAddAccount={() => setShowAccountSetup(true)}
        onCompose={handleCompose}
        onToggleCollapse={onToggleCollapse}
      />

      {/* Message list */}
      {activeAccountId && selectedFolderId ? (
        <MailList
          accountId={activeAccountId}
          folderId={selectedFolderId}
          selectedMessageId={selectedMessageId}
          onSelectMessage={setSelectedMessageId}
        />
      ) : (
        <div className="flex w-72 shrink-0 items-center justify-center border-r border-border-base">
          <Empty
            image={<Mail className="size-10 stroke-1" />}
            description="Select a folder"
          />
        </div>
      )}

      {/* Message detail */}
      {selectedMessageId ? (
        <MailViewer
          messageId={selectedMessageId}
          onReply={handleReply}
          onClose={() => setSelectedMessageId(null)}
        />
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <Empty
            image={<Mail className="size-10 stroke-1" />}
            description={
              selectedFolderId
                ? "Select a message to read"
                : "Select a folder to view messages"
            }
          />
        </div>
      )}

      {/* Composer overlay */}
      {showComposer && activeAccountId && (
        <MailComposer
          accountId={activeAccountId}
          replyToMessageId={composerReplyTo}
          onClose={() => {
            setShowComposer(false);
            setComposerReplyTo(null);
          }}
        />
      )}
    </div>
  );
}
