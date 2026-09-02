"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChatStore } from "../utils/store";
import type { Attachment } from "../utils/types";
import { useRealtimeConnection } from "../hooks/use-realtime-connection";
import { ConversationList } from "./conversation-list";
import { ConversationSelect } from "./conversation-select";
import { ChatArea } from "./chat-area";
import { ThreadPanel } from "@/features/threads/components/ThreadPanel";

export function Messenger() {
  const { user } = useAuth();
  const {
    conversations,
    selectedConversationId,
    draft,
    init,
    selectConversation,
    setDraft,
    sendMessage,
    editMessage,
    deleteMessage,
    getActiveConversation,
    openThreadPanel,
    selectedThreadParentId,
    currentUserId,
    messageReactions,
    addReaction,
    removeReaction,
    typingUsers,
    userPresence,
  } = useChatStore();

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    if (user) init(user.id);
  }, [user, init]);

  // One shared connection for the session - see use-realtime-connection.ts
  const { sendTyping } = useRealtimeConnection(!!user, selectedConversationId);

  useEffect(() => {
    setAttachments([]);
  }, [selectedConversationId]);

  const handleAddAttachments = useCallback((files: FileList) => {
    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: "file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      name: file.name,
      size: file.size,
      type: file.type,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!draft.trim() && attachments.length === 0) return;

      // Attachments aren't wired to the backend yet - no upload endpoint
      // exists. Only the text content is actually sent for now.
      sendMessage(draft);
      setAttachments([]);
    },
    [draft, attachments, sendMessage],
  );

  const activeConversation = getActiveConversation();
  if (!activeConversation) return null;
  const parentMessage = selectedThreadParentId
    ? activeConversation.messages.find(
        (message) => message.id === selectedThreadParentId,
      )
    : undefined;

  return (
    <div className="border-border/20 bg-background relative grid h-[calc(100dvh-5.5rem)] w-full grid-rows-[auto,1fr] gap-2 overflow-hidden rounded-lg border backdrop-blur-sm sm:gap-2.5 lg:[grid-template-columns:280px_1fr] lg:grid-rows-[1fr] lg:gap-2.5 lg:p-2">
      <ConversationSelect
        conversations={conversations}
        selectedId={selectedConversationId}
        onSelect={selectConversation}
      />
      <ConversationList
        conversations={conversations}
        selectedId={selectedConversationId}
        onSelect={selectConversation}
      />
      <ChatArea
        conversation={activeConversation}
        draft={draft}
        onDraftChange={setDraft}
        onTyping={() => sendTyping(selectedConversationId)}
        onSubmit={handleSubmit}
        attachments={attachments}
        onAddAttachments={handleAddAttachments}
        onRemoveAttachment={handleRemoveAttachment}
        onOpenThread={(message) => openThreadPanel(message.id)}
        reactions={messageReactions}
        currentUserId={currentUserId ?? ""}
        onToggleReaction={(messageId, emoji) => {
          const existing = (messageReactions[messageId] || []).find(
            (reaction) => reaction.userId === currentUserId,
          );
          if (existing?.emoji === emoji) {
            void removeReaction(messageId, currentUserId ?? "");
          } else {
            void addReaction(messageId, currentUserId ?? "", emoji);
          }
        }}
        onEditMessage={(messageId, content) => {
          void editMessage(messageId, content);
        }}
        onDeleteMessage={(messageId) => {
          void deleteMessage(messageId);
        }}
        typingUserCount={
          (typingUsers[selectedConversationId] || []).filter(
            (userId) => userId !== currentUserId,
          ).length
        }
        activeUserCount={
          Object.values(userPresence).filter((status) => status === "active")
            .length
        }
      />
      {parentMessage && <ThreadPanel parentMessage={parentMessage} />}
    </div>
  );
}
