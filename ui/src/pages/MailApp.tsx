import { useState } from "react";
import { AccountSetup } from "../components/AccountSetup";
import { MailComposer } from "../components/MailComposer";
import { MailList } from "../components/MailList";
import { MailSidebar } from "../components/MailSidebar";
import { MailViewer } from "../components/MailViewer";
import { useMailAccounts } from "../hooks/useMailAccounts";

export default function MailApp() {
  const { accounts, isLoading: accountsLoading } = useMailAccounts();
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

  if (accountsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
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

  const handleReply = (messageId: string) => {
    setComposerReplyTo(messageId);
    setShowComposer(true);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — accounts + folders */}
      <MailSidebar
        accounts={accounts}
        selectedAccountId={activeAccountId}
        selectedFolderId={selectedFolderId}
        onSelectAccount={(id) => {
          setSelectedAccountId(id);
          setSelectedFolderId(null);
          setSelectedMessageId(null);
        }}
        onSelectFolder={(id) => {
          setSelectedFolderId(id);
          setSelectedMessageId(null);
        }}
        onAddAccount={() => setShowAccountSetup(true)}
        onCompose={() => {
          setComposerReplyTo(null);
          setShowComposer(true);
        }}
      />

      {/* Message list */}
      {activeAccountId && selectedFolderId && (
        <MailList
          accountId={activeAccountId}
          folderId={selectedFolderId}
          selectedMessageId={selectedMessageId}
          onSelectMessage={setSelectedMessageId}
        />
      )}

      {/* Message viewer */}
      {selectedMessageId ? (
        <MailViewer
          messageId={selectedMessageId}
          onReply={handleReply}
          onClose={() => setSelectedMessageId(null)}
        />
      ) : (
        !selectedFolderId && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            Select a folder to view messages
          </div>
        )
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
