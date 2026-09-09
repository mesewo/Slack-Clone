"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChatStore } from "../utils/store";
import type { Attachment } from "../utils/types";
import { messageService } from "@/features/workspace/services/messageService";
import { useRealtimeConnection } from "../hooks/use-realtime-connection";
import { ConversationList } from "./conversation-list";
import { ConversationSelect } from "./conversation-select";
import { ChatArea } from "./chat-area";
import { ThreadPanel } from "@/features/threads/components/ThreadPanel";
import { toast } from "sonner";
import { productivityService } from "@/features/workspace/services/productivityService";

export function Messenger() {
  const { user } = useAuth();
  const {
    conversations,
    selectedConversationId,
    draft,
    init,
    selectConversation,
    markConversationRead,
    loadOlderMessages,
    loadingOlderMessages,
    setDraft,
    createChannel,
    createDM,
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
  } = useChatStore();

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    if (user) init(user.id);
  }, [user, init]);

  // One shared connection for the session - see use-realtime-connection.ts
  const { sendTyping } = useRealtimeConnection(!!user, selectedConversationId);

  const handleMarkRead = useCallback(() => {
    if (selectedConversationId)
      void markConversationRead(selectedConversationId);
  }, [markConversationRead, selectedConversationId]);

  useEffect(() => {
    setAttachments([]);
  }, [selectedConversationId]);

  const handleAddAttachments = useCallback((files: FileList) => {
    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: "file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      name: file.name,
      size: file.size,
      type: file.type,
      file,
      url: URL.createObjectURL(file),
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!draft.trim() && attachments.length === 0) return;

      const uploaded = await Promise.all(
        attachments
          .filter((attachment) => attachment.file)
          .map((attachment) => messageService.upload(attachment.file!)),
      );
      await sendMessage(
        draft,
        uploaded.map((attachment) => attachment.id),
      );
      setAttachments([]);
    },
    [draft, attachments, sendMessage],
  );

  const handleCreateChannel = useCallback(
    async (name: string, type: "PUBLIC" | "PRIVATE") => {
      try {
        await createChannel(name, type);
        toast.success(`Channel #${name.replace(/^#/, "").trim()} created`);
      } catch {
        toast.error("Could not create that channel");
        throw new Error("Could not create channel");
      }
    },
    [createChannel],
  );

  const handleCreateDM = useCallback(
    async (userId: string) => {
      try {
        await createDM(userId);
        toast.success("Direct message opened");
      } catch {
        toast.error("Could not open that direct message");
        throw new Error("Could not open direct message");
      }
    },
    [createDM],
  );

  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    return (
      <div className="border-border/60 bg-background relative grid h-[calc(100dvh-5.5rem)] w-full grid-rows-[auto,1fr] gap-2 overflow-hidden rounded-[24px] border shadow-[0_1px_0_rgba(15,23,42,0.04),0_18px_40px_rgba(15,23,42,0.05)] sm:gap-2.5 lg:[grid-template-columns:280px_1fr] lg:grid-rows-[1fr] lg:gap-2.5 lg:p-2">
        <ConversationSelect
          conversations={conversations}
          selectedId={selectedConversationId}
          onSelect={selectConversation}
          onCreateChannel={handleCreateChannel}
          onCreateDM={handleCreateDM}
        />
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversationId}
          onSelect={selectConversation}
          onCreateChannel={handleCreateChannel}
          onCreateDM={handleCreateDM}
        />
        <main className="border-border/60 bg-background hidden min-h-0 items-center justify-center rounded-[22px] border lg:col-start-2 lg:col-end-3 lg:flex">
          <p className="text-muted-foreground text-sm">
            Select a conversation to start messaging
          </p>
        </main>
      </div>
    );
  }
  const parentMessage = selectedThreadParentId
    ? activeConversation.messages.find(
        (message) => message.id === selectedThreadParentId,
      )
    : undefined;

  return (
    <div className="border-border/60 bg-background relative grid h-[calc(100dvh-5.5rem)] w-full grid-rows-[auto,1fr] gap-2 overflow-hidden rounded-[24px] border shadow-[0_1px_0_rgba(15,23,42,0.04),0_18px_40px_rgba(15,23,42,0.05)] backdrop-blur-sm sm:gap-2.5 lg:[grid-template-columns:280px_1fr] lg:grid-rows-[1fr] lg:gap-2.5 lg:p-2">
      <ConversationSelect
        conversations={conversations}
        selectedId={selectedConversationId}
        onSelect={selectConversation}
        onCreateChannel={handleCreateChannel}
        onCreateDM={handleCreateDM}
      />
      <ConversationList
        conversations={conversations}
        selectedId={selectedConversationId}
        onSelect={selectConversation}
        onCreateChannel={handleCreateChannel}
        onCreateDM={handleCreateDM}
      />
      <ChatArea
        conversation={activeConversation}
        onMarkRead={handleMarkRead}
        onLoadOlderMessages={loadOlderMessages}
        loadingOlderMessages={loadingOlderMessages}
        onSchedule={async (scheduledFor) => {
          await productivityService.scheduleMessage({
            ...(activeConversation.kind === "dm"
              ? { conversation_id: activeConversation.dmId }
              : { channel_id: activeConversation.id }),
            content: draft,
            scheduled_for: scheduledFor,
          });
          setDraft("");
          toast.success("Message scheduled");
        }}
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
        onToggleThreadSubscription={(messageId) => {
          void productivityService
            .subscribeThread(messageId)
            .then(() => toast.success("Thread followed"))
            .catch(() => toast.error("Could not follow thread"));
        }}
        typingUserCount={
          (typingUsers[selectedConversationId] || []).filter(
            (userId) => userId !== currentUserId,
          ).length
        }
      />
      {parentMessage && <ThreadPanel parentMessage={parentMessage} />}
    </div>
  );
}
