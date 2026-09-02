"use client";

import { FormEvent, useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Attachment, Conversation } from "../utils/types";
import { ChatHeader } from "./chat-header";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";

interface ChatAreaProps {
  conversation: Conversation;
  draft: string;
  onDraftChange: (text: string) => void;
  onTyping?: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  attachments: Attachment[];
  onAddAttachments: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  onOpenThread: (message: import("../utils/types").Message) => void;
  reactions: Record<string, Array<{ userId: string; emoji: string }>>;
  currentUserId: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEditMessage: (messageId: string, content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  typingUserCount: number;
  activeUserCount: number;
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
  onOpenThread,
  reactions,
  currentUserId,
  onToggleReaction,
  onEditMessage,
  onDeleteMessage,
  typingUserCount,
  activeUserCount,
}: ChatAreaProps) {
  const shouldReduceMotion = useReducedMotion();
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const liveRegionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    const behavior = shouldReduceMotion ? "auto" : "smooth";

    const scrollToBottom = () => {
      container.scrollTo({ top: container.scrollHeight, behavior });
    };

    if (behavior === "smooth") {
      requestAnimationFrame(scrollToBottom);
    } else {
      scrollToBottom();
    }
  }, [conversation.messages, conversation.id, shouldReduceMotion]);

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
          className="border-border/30 bg-background flex min-h-0 flex-col gap-2 overflow-hidden rounded-lg border sm:gap-2.5 lg:col-start-2 lg:col-end-3"
        >
          <ChatHeader conversation={conversation} />
          <div className="text-muted-foreground px-3 sm:px-4 flex min-h-3 items-center gap-2 text-[0.7rem]">
            <span>
              {activeUserCount > 0
                ? `${activeUserCount} active`
                : "No active users"}
            </span>
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
            className="[&::-webkit-scrollbar-thumb]:bg-muted relative min-h-0 flex-1 space-y-2 overflow-y-auto px-3 sm:space-y-2.5 sm:px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full"
            aria-live="off"
            aria-label={"Message thread with " + conversation.name}
          >
            <AnimatePresence initial={false}>
              {conversation.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onOpenThread={onOpenThread}
                  reactions={reactions[message.id] || []}
                  currentUserId={currentUserId}
                  onToggleReaction={onToggleReaction}
                  onEdit={onEditMessage}
                  onDelete={onDeleteMessage}
                />
              ))}
            </AnimatePresence>
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
