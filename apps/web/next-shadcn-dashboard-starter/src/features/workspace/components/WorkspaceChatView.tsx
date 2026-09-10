"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useChatStore } from "@/features/chat/utils/store";
import type { Attachment, Message } from "@/features/chat/utils/types";
import { messageService } from "@/features/workspace/services/messageService";
import { productivityService } from "@/features/workspace/services/productivityService";
import { ConversationSelect } from "@/features/chat/components/conversation-select";
import { ChatArea } from "@/features/chat/components/chat-area";
import { ThreadPanel } from "@/features/threads/components/ThreadPanel";

export function WorkspaceChatView() {
  const { user } = useAuth();
  const params = useParams<{
    workspaceId: string;
    channelId?: string;
    dmId?: string;
    conversationId?: string;
  }>();
  const router = useRouter();
  const selectedRouteId =
    params.channelId ||
    (params.dmId || params.conversationId
      ? `dm:${params.dmId || params.conversationId}`
      : "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const {
    conversations,
    selectedConversationId,
    draft,
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

  useEffect(() => {
    if (selectedRouteId && selectedRouteId !== selectedConversationId) {
      selectConversation(selectedRouteId);
    }
  }, [selectedConversationId, selectedRouteId, selectConversation]);

  useEffect(() => setAttachments([]), [selectedConversationId]);

  const activeConversation = getActiveConversation();
  const handleMarkRead = useCallback(() => {
    if (selectedConversationId)
      void markConversationRead(selectedConversationId);
  }, [markConversationRead, selectedConversationId]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!draft.trim() && attachments.length === 0) return;
      const uploaded = await Promise.all(
        attachments
          .filter((item) => item.file)
          .map((item) => messageService.upload(item.file!)),
      );
      await sendMessage(
        draft,
        uploaded.map((item) => item.id),
      );
      setAttachments([]);
    },
    [attachments, draft, sendMessage],
  );

  const handleAddAttachments = useCallback((files: FileList) => {
    setAttachments((current) => [
      ...current,
      ...Array.from(files).map((file) => ({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
  }, []);

  const openConversation = (id: string) => {
    selectConversation(id);
    router.push(
      id.startsWith("dm:")
        ? `/workspace/${params.workspaceId}/dms/${id.slice(3)}`
        : `/workspace/${params.workspaceId}/channels/${id}`,
    );
  };

  if (!user || !activeConversation) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-muted-foreground">
        Loading conversation...
      </div>
    );
  }

  const parentMessage = selectedThreadParentId
    ? activeConversation.messages.find(
        (message) => message.id === selectedThreadParentId,
      )
    : undefined;
  return (
    <div className="flex min-h-0 h-full flex-1 flex-col gap-2 p-2 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_auto]">
      <ConversationSelect
        conversations={conversations}
        selectedId={selectedConversationId}
        onSelect={openConversation}
        onCreateChannel={async (name, type) => {
          await createChannel(name, type);
          toast.success(`Channel #${name.replace(/^#/, "").trim()} created`);
        }}
        onCreateDM={async (userId) => {
          await createDM(userId);
          toast.success("Direct message opened");
        }}
      />
      <ChatArea
        conversation={activeConversation}
        draft={draft}
        onDraftChange={setDraft}
        onTyping={() => undefined}
        onSubmit={handleSubmit}
        attachments={attachments}
        onAddAttachments={handleAddAttachments}
        onRemoveAttachment={(id) =>
          setAttachments((current) => current.filter((item) => item.id !== id))
        }
        onOpenThread={(message) => void openThreadPanel(message.id)}
        reactions={messageReactions}
        currentUserId={currentUserId ?? ""}
        onToggleReaction={(messageId, emoji) => {
          const existing = (messageReactions[messageId] || []).find(
            (reaction) => reaction.userId === currentUserId,
          );
          void (existing?.emoji === emoji
            ? removeReaction(messageId, currentUserId ?? "")
            : addReaction(messageId, currentUserId ?? "", emoji));
        }}
        onEditMessage={(messageId, content) =>
          void editMessage(messageId, content)
        }
        onDeleteMessage={(messageId) => void deleteMessage(messageId)}
        onToggleThreadSubscription={(messageId) =>
          void productivityService.subscribeThread(messageId)
        }
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
        typingUserCount={
          (typingUsers[selectedConversationId] || []).filter(
            (id) => id !== currentUserId,
          ).length
        }
      />
      {parentMessage && <ThreadPanel parentMessage={parentMessage} />}
    </div>
  );
}
