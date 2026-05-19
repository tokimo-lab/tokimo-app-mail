import { useQueryClient } from "@tanstack/react-query";
import {
  cn,
  Empty,
  ScrollArea,
  type ScrollAreaRef,
  SearchInput,
  Spin,
} from "@tokimo/ui";
import { Inbox, Paperclip, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/generated/rust-api";
import type {
  MailMessageListOutput,
  MailMessageSummaryOutput,
} from "@/generated/rust-api/mail";
import { useWs } from "@/system/events/ws";

const PAGE_SIZE = 50;
const LOAD_THRESHOLD = 120; // px from bottom to trigger next page

interface MailListProps {
  accountId: string;
  folderId: string;
  selectedMessageId: string | null;
  onSelectMessage: (id: string) => void;
}

export function MailList({
  accountId,
  folderId,
  selectedMessageId,
  onSelectMessage,
}: MailListProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [allMessages, setAllMessages] = useState<MailMessageSummaryOutput[]>(
    [],
  );
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInputValue, setSearchInputValue] = useState("");

  // Debounce search input → update query after 300ms idle.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInputValue.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInputValue]);
  const prevFolderRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<ScrollAreaRef | null>(null);
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(true);

  // Reset when folder changes (also clear search).
  useEffect(() => {
    const key = `${accountId}/${folderId}`;
    if (key === prevFolderRef.current) return;
    prevFolderRef.current = key;
    setPage(1);
    setAllMessages([]);
    setHasMore(true);
    hasMoreRef.current = true;
    setSearchQuery("");
    setSearchInputValue("");
  }, [accountId, folderId]);

  const { data, isFetching, isLoading } = api.mail.listMessages.useQuery(
    { accountId, folderId, page, pageSize: PAGE_SIZE },
    {
      enabled: !!accountId && !!folderId && !searchQuery,
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  );

  const { data: searchData, isFetching: isSearchFetching } =
    api.mail.searchMessages.useQuery(
      { accountId, q: searchQuery },
      { enabled: !!searchQuery },
    );

  // Keep refs in sync so the scroll handler (stable closure) can access latest values.
  isFetchingRef.current = isFetching;
  hasMoreRef.current = hasMore;

  // Append newly fetched page to accumulated list.
  useEffect(() => {
    if (!data) return;
    const fetched = data.messages as MailMessageSummaryOutput[];
    setAllMessages((prev) => (page === 1 ? fetched : [...prev, ...fetched]));
    const more = fetched.length === PAGE_SIZE;
    setHasMore(more);
    hasMoreRef.current = more;
  }, [data, page]);

  // ScrollArea uses CSS transform — IntersectionObserver won't work.
  // Instead, detect near-bottom via onScrollChange (scrollY) + sentinel offsetTop.
  const handleScrollChange = useCallback((_x: number, scrollY: number) => {
    if (!hasMoreRef.current || isFetchingRef.current) return;
    const sentinel = sentinelRef.current;
    const viewport = scrollAreaRef.current?.getViewportRect();
    if (!sentinel || !viewport) return;
    const viewportHeight = viewport.height;
    // sentinel.offsetTop is its distance from the content container top.
    if (scrollY + viewportHeight >= sentinel.offsetTop - LOAD_THRESHOLD) {
      setPage((p) => p + 1);
    }
  }, []);

  // Optimistic read state: update React Query cache directly so state
  // survives folder switches without any re-sync.
  const queryClient = useQueryClient();
  const markReadMutation = api.mail.markRead.useMutation();

  const markAsReadInCache = useCallback(
    (id: string) => {
      // Update every cached page for this folder.
      for (let p = 1; p <= page; p++) {
        const key = api.mail.listMessages.queryKey({
          accountId,
          folderId,
          page: p,
          pageSize: PAGE_SIZE,
        });
        queryClient.setQueryData<MailMessageListOutput>(key, (old) => {
          if (!old) return old;
          const found = old.messages.some((m) => m.id === id && !m.isRead);
          if (!found) return old;
          return {
            ...old,
            messages: old.messages.map((m) =>
              m.id === id ? { ...m, isRead: true } : m,
            ),
          };
        });
      }
    },
    [accountId, folderId, page, queryClient],
  );

  // Subscribe to mail:flags_synced to apply IMAP flag changes in real-time.
  const ws = useWs();
  useEffect(() => {
    return ws.subscribe("mail:flags_synced", (msg) => {
      const data = msg.data as {
        accountId: string;
        folderId: string;
        readUids: number[];
        unreadUids: number[];
      };
      if (data.folderId !== folderId) return;
      const readSet = new Set(data.readUids);
      const unreadSet = new Set(data.unreadUids);
      if (readSet.size === 0 && unreadSet.size === 0) return;

      // Update local state.
      setAllMessages((prev) =>
        prev.map((m) => {
          if (readSet.has(m.uid)) return { ...m, isRead: true };
          if (unreadSet.has(m.uid)) return { ...m, isRead: false };
          return m;
        }),
      );

      // Update React Query cache for all pages.
      for (let p = 1; p <= page; p++) {
        const key = api.mail.listMessages.queryKey({
          accountId,
          folderId,
          page: p,
          pageSize: PAGE_SIZE,
        });
        queryClient.setQueryData<MailMessageListOutput>(key, (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) => {
              if (readSet.has(m.uid)) return { ...m, isRead: true };
              if (unreadSet.has(m.uid)) return { ...m, isRead: false };
              return m;
            }),
          };
        });
      }
    });
  }, [accountId, folderId, page, queryClient, ws]);

  // Subscribe to mail:new_messages (IMAP IDLE push) to show new mail instantly.
  useEffect(() => {
    return ws.subscribe("mail:new_messages", (msg) => {
      const data = msg.data as {
        accountId: string;
        folderId: string;
        count: number;
      };
      if (data.accountId !== accountId || data.folderId !== folderId) return;
      // Invalidate page 1 so the list refreshes with the new messages at top.
      queryClient.invalidateQueries({
        queryKey: api.mail.listMessages.queryKey({
          accountId,
          folderId,
          page: 1,
          pageSize: PAGE_SIZE,
        }),
      });
      // Reset to page 1 to show the newest messages.
      // Keep existing messages visible until fresh data arrives.
      setPage(1);
      setHasMore(true);
      hasMoreRef.current = true;
    });
  }, [accountId, folderId, queryClient, ws]);

  const handleSelectMessage = useCallback(
    (id: string) => {
      // Update local list immediately (no re-render lag).
      setAllMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)),
      );
      markAsReadInCache(id);
      // Fire-and-forget to server for persistence.
      markReadMutation.mutate({ message_ids: [id] });
      onSelectMessage(id);
    },
    [markAsReadInCache, markReadMutation, onSelectMessage],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchInputValue(e.target.value);
    },
    [],
  );

  // Decide which messages to show.
  const displayMessages = searchQuery
    ? (searchData?.messages ?? [])
    : allMessages;
  const total = searchQuery ? (searchData?.total ?? 0) : (data?.total ?? 0);
  const loading =
    (isLoading && page === 1 && !searchQuery) ||
    (isSearchFetching && !!searchQuery);

  if (loading) {
    return (
      <div className="flex h-full w-72 shrink-0 flex-col border-r border-border-base">
        <div className="border-b border-border-base px-3 py-2">
          <SearchInput
            value={searchInputValue}
            placeholder={t("mail.list.search")}
            onChange={handleSearchChange}
            className="w-full"
            size="small"
          />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Spin className="size-5" />
        </div>
      </div>
    );
  }

  if (displayMessages.length === 0 && !isFetching && !isSearchFetching) {
    return (
      <div className="flex h-full w-72 shrink-0 flex-col border-r border-border-base">
        <div className="border-b border-border-base px-3 py-2">
          <SearchInput
            value={searchInputValue}
            placeholder={t("mail.list.search")}
            onChange={handleSearchChange}
            className="w-full"
            size="small"
          />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Empty
            image={<Inbox className="size-10 stroke-1" />}
            description={
              searchQuery
                ? t("mail.list.noResults", { query: searchQuery })
                : t("mail.list.noMessages")
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-border-base">
      {/* Search bar */}
      <div className="border-b border-border-base px-3 py-2">
        <SearchInput
          value={searchInputValue}
          placeholder={t("mail.list.search")}
          onChange={handleSearchChange}
          className="w-full"
          size="small"
        />
      </div>

      {/* Header */}
      <div className="border-b border-border-base px-3 py-1.5">
        <span className="text-xs text-fg-muted">
          {searchQuery
            ? t("mail.list.resultsCount", { count: total })
            : t("mail.list.messagesCount", { count: total })}
        </span>
      </div>

      <ScrollArea
        ref={scrollAreaRef}
        direction="vertical"
        className="flex-1"
        onScrollChange={handleScrollChange}
      >
        <div className="divide-y divide-border-subtle">
          {displayMessages.map((msg) => (
            <MessageRow
              key={msg.id}
              message={msg}
              isSelected={selectedMessageId === msg.id}
              onClick={() => handleSelectMessage(msg.id)}
            />
          ))}
        </div>
        {/* Sentinel: offsetTop used to detect near-bottom */}
        <div ref={sentinelRef} className="h-1" />
        {isFetching && page > 1 && (
          <div className="flex justify-center py-3">
            <Spin className="size-4" />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function MessageRow({
  message,
  isSelected,
  onClick,
}: {
  message: MailMessageSummaryOutput;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const isUnread = !message.isRead;
  const fromDisplay =
    message.from.length > 0
      ? message.from[0].name || message.from[0].address
      : t("mail.list.unknownSender");

  const dateStr = message.date
    ? formatRelativeDate(new Date(message.date))
    : "";

  return (
    <button
      type="button"
      className={cn(
        "group/msg flex w-full cursor-pointer flex-col gap-0.5 overflow-hidden px-3 py-2 text-left transition-colors",
        isSelected ? "bg-accent/10" : "hover:bg-fill-tertiary",
        !isSelected && isUnread && "bg-fill-tertiary",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {isUnread && !isSelected && (
          <span className="size-2 shrink-0 rounded-full bg-accent" />
        )}
        <span
          className={cn(
            "truncate text-sm",
            isUnread || isSelected
              ? "font-semibold text-fg-primary"
              : "text-fg-primary",
          )}
        >
          {fromDisplay}
        </span>
        <span className="ml-auto shrink-0 text-xs text-fg-muted">
          {dateStr}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "truncate text-sm",
            isUnread || isSelected
              ? "font-medium text-fg-primary"
              : "text-fg-muted",
          )}
        >
          {message.subject || t("mail.list.noSubject")}
        </span>
        {message.isFlagged && (
          <Star className="size-3 shrink-0 fill-yellow-400 text-yellow-400" />
        )}
        {message.hasAttachments && (
          <Paperclip className="size-3 shrink-0 text-fg-muted" />
        )}
      </div>
      {message.preview && (
        <p className="truncate text-xs text-fg-muted">{message.preview}</p>
      )}
    </button>
  );
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
