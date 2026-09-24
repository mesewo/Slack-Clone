"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Input } from "@/components/ui/input";
import { Icons } from "@/components/icons";
import {
  messageService,
  type MessageSearchResult,
} from "@/features/workspace/services/messageService";
import type { Attachment, Conversation } from "../utils/types";
import { ChatHeader } from "./chat-header";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import { PresenceIndicator } from "./PresenceIndicator";
import { useChatStore } from "../utils/store";

interface ChatAreaProps {
  conversation: Conversation;
  draft: string;
  onDraftChange: (text: string) => void;
  onTyping?: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  attachments: Attachment[];
  onAddAttachments: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  isUploading?: boolean;
  onOpenThread: (message: import("../utils/types").Message) => void;
  reactions: Record<string, Array<{ userId: string; emoji: string }>>;
  currentUserId: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEditMessage: (messageId: string, content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onToggleThreadSubscription: (messageId: string) => void;
  onMarkRead: () => void;
  onLoadOlderMessages: () => Promise<void>;
  loadingOlderMessages: boolean;
  onSchedule: (scheduledFor: string) => Promise<void>;
  typingUserCount: number;
  canManageChannel?: boolean;
}

export function ChatArea({
  conversation,
  draft,
  onDraftChange,
  onTyping,
  onSubmit,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  isUploading,
  onOpenThread,
  reactions,
  currentUserId,
  onToggleReaction,
  onEditMessage,
  onDeleteMessage,
  onToggleThreadSubscription,
  onMarkRead,
  onLoadOlderMessages,
  loadingOlderMessages,
  onSchedule,
  typingUserCount,
  canManageChannel,
}: ChatAreaProps) {
  const userPresence = useChatStore((state) => state.userPresence);
  const shouldReduceMotion = useReducedMotion();
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const newMessagesMarkerRef = useRef<HTMLDivElement | null>(null);
  const liveRegionRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<MessageSearchResult[]>([]);
  const [searchCursor, setSearchCursor] = useState<string | undefined>();
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const isAtBottomRef = useRef(true);
  const isJumpingToLatestRef = useRef(false);
  const mentionSuggestions = Array.from(
    new Set([
      "here",
      "channel",
      ...conversation.messages.map((message) => message.author),
    ]),
  );

  useEffect(() => {
    const query = search.trim();
    if (!query) {
      setSearchResults([]);
      setSearchCursor(undefined);
      setSearchHasMore(false);
      setSearchError(false);
      return;
    }
    let cancelled = false;
    const searchRequest =
      conversation.kind === "dm"
        ? messageService
            .searchDM(conversation.dmId!, query)
            .then((results) => ({
              results,
              nextCursor: undefined,
              hasMore: false,
            }))
        : messageService.search(conversation.id, query);
    void searchRequest
      .then((page) => {
        if (!cancelled) {
          setSearchResults(page.results);
          setSearchCursor(page.nextCursor);
          setSearchHasMore(page.hasMore);
          setSearchError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSearchResults([]);
          setSearchCursor(undefined);
          setSearchHasMore(false);
          setSearchError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.id, search]);

  const loadMoreSearchResults = async () => {
    if (
      conversation.kind === "dm" ||
      !searchCursor ||
      searchLoadingMore ||
      !search.trim()
    ) {
      return;
    }
    setSearchLoadingMore(true);
    try {
      const page = await messageService.search(
        conversation.id,
        search.trim(),
        searchCursor,
      );
      setSearchResults((current) => [...current, ...page.results]);
      setSearchCursor(page.nextCursor);
      setSearchHasMore(page.hasMore);
    } catch {
      setSearchError(true);
    } finally {
      setSearchLoadingMore(false);
    }
  };

  const jumpToMessage = (messageId: string) => {
    const target = messagesContainerRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${messageId}"]`,
    );
    target?.scrollIntoView({
      behavior: shouldReduceMotion ? "auto" : "smooth",
      block: "center",
    });
    setSearch("");
  };

  useEffect(() => {
    isAtBottomRef.current = conversation.unread === 0;
    setShowJumpToLatest(conversation.unread > 1);
  }, [conversation.id]);

  useEffect(() => {
    if (conversation.unread === 0 || !newMessagesMarkerRef.current) return;
    requestAnimationFrame(() => {
      newMessagesMarkerRef.current?.scrollIntoView({
        behavior: "auto",
        block: "center",
      });
    });
  }, [conversation.id, conversation.messages.length, conversation.unread]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    const behavior = shouldReduceMotion ? "auto" : "smooth";

    if (conversation.unread > 0 && !isAtBottomRef.current) return;

    const scrollToBottom = () => {
      container.scrollTo({ top: container.scrollHeight, behavior });
      isAtBottomRef.current = true;
      setShowJumpToLatest(false);
      if (conversation.unread > 0) onMarkRead();
    };

    if (behavior === "smooth") {
      requestAnimationFrame(scrollToBottom);
    } else {
      scrollToBottom();
    }
  }, [
    conversation.messages,
    conversation.id,
    conversation.unread,
    onMarkRead,
    shouldReduceMotion,
  ]);

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (container.scrollTop < 120 && !loadingOlderMessages) {
      void onLoadOlderMessages();
    }
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      16;
    if (isJumpingToLatestRef.current && atBottom) {
      isJumpingToLatestRef.current = false;
    }
    isAtBottomRef.current = atBottom;
    if (!isJumpingToLatestRef.current) {
      setShowJumpToLatest(!atBottom && conversation.unread > 1);
    }
    if (atBottom && conversation.unread > 0) onMarkRead();
  };

  const jumpToLatest = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    isJumpingToLatestRef.current = true;
    container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
    isAtBottomRef.current = true;
    setShowJumpToLatest(false);
    isJumpingToLatestRef.current = false;
    onMarkRead();
  };

  const dateLabel = (message: (typeof conversation.messages)[number]) => {
    if (!message.createdAt) return null;
    return new Date(message.createdAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  useEffect(() => {
    if (!liveRegionRef.current) return;
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (!lastMessage) return;
    liveRegionRef.current.textContent =
      lastMessage.author +
      " at " +
      lastMessage.timestamp +
      ": " +
      lastMessage.text;
  }, [conversation.messages]);

  return (
    <>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={conversation.id}
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
          className="border-border/70 bg-background flex min-h-0 flex-col gap-2 overflow-hidden rounded-2xl border shadow-[0_1px_0_rgba(15,23,42,0.04),0_18px_40px_rgba(15,23,42,0.05)] sm:gap-2.5 lg:col-start-2 lg:col-end-3"
        >
          <ChatHeader
            conversation={conversation}
            canManageChannel={canManageChannel}
          />
          <div className="relative px-3 sm:px-4">
            <Icons.search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-5 h-4 w-4 -translate-y-1/2 sm:left-6"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${conversation.name}`}
              aria-label={`Search messages in ${conversation.name}`}
              className="border-border/70 bg-muted/30 h-9 rounded-lg pl-9 text-xs shadow-inner shadow-black/5 sm:text-sm"
            />
            {search.trim() && (
              <div className="border-border/70 bg-popover absolute top-10 right-3 left-3 z-30 max-h-56 overflow-y-auto rounded-xl border p-1 shadow-xl sm:right-4 sm:left-4">
                {searchError ? (
                  <p className="text-destructive p-3 text-xs">
                    Search is temporarily unavailable
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-xs">
                    No messages found
                  </p>
                ) : (
                  <>
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        data-testid={`search-result-${result.id}`}
                        onClick={() => jumpToMessage(result.id)}
                        className="hover:bg-accent block w-full rounded p-2 text-left text-xs"
                      >
                        <span className="text-foreground block font-medium">
                          {result.author || "Unknown"}
                        </span>
                        <span className="text-muted-foreground block text-[0.68rem]">
                          {conversation.name} ·{" "}
                          {new Date(result.created_at).toLocaleString()}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block line-clamp-2">
                          {result.content}
                        </span>
                      </button>
                    ))}
                    {searchHasMore && (
                      <button
                        type="button"
                        onClick={() => void loadMoreSearchResults()}
                        disabled={searchLoadingMore}
                        className="text-primary hover:bg-accent w-full rounded p-2 text-center text-xs font-medium disabled:opacity-60"
                      >
                        {searchLoadingMore ? "Loading..." : "Load more"}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="text-muted-foreground flex min-h-3 items-center gap-2 px-3 text-[0.7rem] sm:px-4">
            {conversation.kind === "dm" && conversation.otherUserId && (
              <PresenceIndicator
                state={userPresence[conversation.otherUserId] || "offline"}
                customStatus={conversation.customStatus}
              />
            )}
            {typingUserCount > 0 && (
              <span className="text-primary">
                {typingUserCount === 1
                  ? "Someone is typing..."
                  : `${typingUserCount} people are typing...`}
              </span>
            )}
          </div>

          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="[&::-webkit-scrollbar-thumb]:bg-muted relative min-h-0 flex-1 space-y-2 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.06),_transparent_32%)] px-3 sm:space-y-2.5 sm:px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full"
            aria-live="off"
            aria-label={"Message thread with " + conversation.name}
          >
            {conversation.name.endsWith("(you)") &&
              conversation.messages.length === 0 && (
                <div className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="bg-sidebar-primary/15 text-sidebar-primary mb-4 flex size-14 items-center justify-center rounded-2xl">
                    <Icons.user className="size-7" />
                  </div>
                  <h2 className="text-lg font-semibold">This is your space</h2>
                  <p className="text-muted-foreground mt-2 max-w-md text-sm">
                    Draft messages, list your to-dos, or keep links and files
                    handy. Only you can see this conversation.
                  </p>
                </div>
              )}
            <AnimatePresence initial={false}>
              {conversation.messages.map((message, index) => {
                const previous = conversation.messages[index - 1];
                const currentDate = dateLabel(message);
                const previousDate = previous ? dateLabel(previous) : null;
                const compact = Boolean(
                  previous &&
                  previous.sender === message.sender &&
                  previous.author === message.author,
                );
                return (
                  <div key={message.id}>
                    {currentDate !== previousDate && currentDate && (
                      <div className="text-muted-foreground my-4 flex items-center gap-3 text-[0.62rem] font-semibold uppercase tracking-[0.16em]">
                        <span className="bg-border h-px flex-1" />
                        <span>{currentDate}</span>
                        <span className="bg-border h-px flex-1" />
                      </div>
                    )}
                    {conversation.unread > 0 &&
                      index ===
                        Math.max(
                          0,
                          conversation.messages.length - conversation.unread,
                        ) && (
                        <div
                          ref={newMessagesMarkerRef}
                          className="text-primary my-3 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em]"
                        >
                          <span className="bg-primary/30 h-px flex-1" />
                          New messages
                          <span className="bg-primary/30 h-px flex-1" />
                        </div>
                      )}
                    <MessageBubble
                      message={message}
                      onOpenThread={onOpenThread}
                      reactions={reactions[message.id] || []}
                      currentUserId={currentUserId}
                      onToggleReaction={onToggleReaction}
                      onEdit={onEditMessage}
                      onDelete={onDeleteMessage}
                      onToggleThreadSubscription={onToggleThreadSubscription}
                      compact={compact}
                    />
                  </div>
                );
              })}
            </AnimatePresence>
            {showJumpToLatest && (
              <button
                type="button"
                onClick={jumpToLatest}
                className="border-border bg-background/95 text-foreground hover:bg-accent absolute right-5 bottom-4 z-10 inline-flex animate-bounce items-center gap-1.5 rounded-full border px-2 py-2 text-xs font-medium shadow-lg backdrop-blur before:absolute before:right-1/2 before:bottom-full before:h-8 before:w-px before:bg-primary/50 motion-reduce:animate-none"
                aria-label="Jump to latest messages"
                title="Jump to latest messages"
              >
                <Icons.chevronDown className="size-4" />
              </button>
            )}
          </div>

          <MessageComposer
            draft={draft}
            onDraftChange={onDraftChange}
            onTyping={onTyping}
            onSubmit={onSubmit}
            contactName={conversation.name}
            quickReplies={conversation.quickReplies}
            attachments={attachments}
            onAddAttachments={onAddAttachments}
            onRemoveAttachment={onRemoveAttachment}
            isUploading={isUploading}
            mentionSuggestions={mentionSuggestions}
            onSchedule={onSchedule}
          />
        </motion.div>
      </AnimatePresence>
      <div
        ref={liveRegionRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      />
    </>
  );
}
