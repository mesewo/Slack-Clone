"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useChatStore } from "@/features/chat/utils/store";
import type { Attachment, Message } from "@/features/chat/utils/types";
import { messageService } from "@/features/workspace/services/messageService";
import { productivityService } from "@/features/workspace/services/productivityService";
import { workspaceService } from "@/features/workspace/services/workspaceService";
import { ChatArea } from "@/features/chat/components/chat-area";
import { ThreadPanel } from "@/features/threads/components/ThreadPanel";
import { useRealtimeTyping } from "@/features/chat/hooks/use-realtime-connection";
import { AppLoader } from "@/components/ui/app-loader";
import { IconMessageCircle } from "@tabler/icons-react";

export function WorkspaceChatView() {
  const { user } = useAuth();
  const params = useParams<{
    workspaceId: string;
    channelId?: string;
    dmId?: string;
    conversationId?: string;
  }>();
  const router = useRouter();
  const sendTyping = useRealtimeTyping();
  const selectedRouteId =
    params.channelId ||
    (params.dmId || params.conversationId
      ? `dm:${params.dmId || params.conversationId}`
      : "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState<string | null>(null);
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
  useEffect(() => {
    void workspaceService
      .listMembers(params.workspaceId)
      .then((result) => setWorkspaceRole(result.role))
      .catch(() => setWorkspaceRole(null));
  }, [params.workspaceId]);

  const activeConversation = getActiveConversation();
  const routeConversation = conversations.find(
    (conversation) => conversation.id === selectedRouteId,
  );
  const handleMarkRead = useCallback(() => {
    if (selectedConversationId)
      void markConversationRead(selectedConversationId);
  }, [markConversationRead, selectedConversationId]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!draft.trim() && attachments.length === 0) return;
      setIsUploading(true);
      setAttachments((current) =>
        current.map((item) => ({ ...item, isUploading: Boolean(item.file) })),
      );
      try {
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
      } catch {
        setAttachments((current) =>
          current.map((item) => ({ ...item, isUploading: false })),
        );
        toast.error("Upload failed. Check the file type and 100MB size limit.");
      } finally {
        setIsUploading(false);
      }
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
        ? `/home/${params.workspaceId}/dms/${id.slice(3)}`
        : `/home/${params.workspaceId}/channels/${id}`,
    );
  };

  if (!user) {
    return (
      <AppLoader />
    );
  }

  if (selectedRouteId && (!routeConversation || selectedConversationId !== selectedRouteId)) {
    return <AppLoader />;
  }

  if (!activeConversation) {
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background text-foreground">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="relative flex size-36 items-center justify-center [perspective:600px]">
            <span className="absolute left-4 top-3 size-20 -rotate-12 rounded-[1.6rem] bg-gradient-to-br from-violet-200 via-fuchsia-400 to-violet-800 shadow-[0_22px_35px_rgba(76,29,149,0.4),inset_0_2px_3px_rgba(255,255,255,0.7)] ring-1 ring-white/30 motion-safe:animate-[bounce_4s_ease-in-out_infinite]" />
            <span className="absolute right-3 bottom-3 flex size-14 rotate-[12deg] items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-sky-200 via-cyan-400 to-blue-700 shadow-[0_16px_26px_rgba(30,64,175,0.35),inset_0_2px_3px_rgba(255,255,255,0.75)] ring-1 ring-white/40 motion-safe:animate-[bounce_4.5s_ease-in-out_infinite]">
              <IconMessageCircle className="size-7 text-white drop-shadow" strokeWidth={2.5} />
            </span>
            <span className="relative -translate-x-2 -translate-y-1 flex size-[4.5rem] -rotate-6 items-center justify-center rounded-[1.5rem] border border-white/60 bg-gradient-to-br from-fuchsia-300 via-purple-500 to-indigo-800 text-white shadow-[0_24px_38px_rgba(88,28,135,0.45),inset_0_3px_5px_rgba(255,255,255,0.55)] ring-1 ring-black/10 motion-safe:animate-[bounce_3.5s_ease-in-out_infinite]">
              <IconMessageCircle className="size-9 drop-shadow-sm" strokeWidth={2.2} />
            </span>
          </div>
          <div>
            <h1 className="text-xl font-semibold">Open to chat</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Choose a channel or direct message from the sidebar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const parentMessage = selectedThreadParentId
    ? activeConversation.messages.find(
        (message) => message.id === selectedThreadParentId,
      )
    : undefined;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ChatArea
        conversation={activeConversation}
        draft={draft}
        onDraftChange={setDraft}
        onTyping={() => {
          if (
            selectedConversationId &&
            !selectedConversationId.startsWith("dm:")
          ) {
            sendTyping(selectedConversationId);
          }
        }}
        onSubmit={handleSubmit}
        attachments={attachments}
        onAddAttachments={handleAddAttachments}
        onRemoveAttachment={(id) =>
          setAttachments((current) => current.filter((item) => item.id !== id))
        }
        isUploading={isUploading}
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
        canManageChannel={
          activeConversation.kind === "channel" &&
          (workspaceRole === "OWNER" || workspaceRole === "ADMIN")
        }
      />
      {parentMessage && <ThreadPanel parentMessage={parentMessage} />}
    </div>
  );
}
