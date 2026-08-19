import { useEffect } from "react";
import { useChatStore } from "@/features/chat/utils/store";
import type { ChatMessage } from "@/features/workspace/services/messageService";

interface WSEvent {
  type: string;
  channel_id?: string;
  payload?: any;
}

/**
 * Hook that listens to WebSocket events and updates the chat store accordingly.
 * Connect this to your WebSocket message handler (useRealtimeConnection).
 */
export function useWSEventDispatcher(lastMessage: any) {
  const {
    addIncomingMessage,
    addThreadReply,
    setUserPresence,
    setTyping,
    updateReactionUI,
    selectedConversationId,
    selectedThreadParentId,
  } = useChatStore();

  useEffect(() => {
    if (!lastMessage) return;

    try {
      const event: WSEvent = JSON.parse(lastMessage.data || lastMessage);

      switch (event.type) {
        // Message events
        case "message_created": {
          const payload = event.payload
            ? JSON.parse(event.payload)
            : event.payload;
          if (event.channel_id && payload) {
            const message: ChatMessage = {
              id: payload.id,
              channel_id: payload.channel_id,
              user_id: payload.user_id,
              content: payload.content,
              created_at: payload.created_at,
              updated_at: payload.updated_at,
              deleted_at: payload.deleted_at,
              parent_id: payload.parent_id,
              reply_count: payload.reply_count || 0,
              author_name: payload.author_name,
            };
            addIncomingMessage(event.channel_id, message);
          }
          break;
        }

        // Thread reply event
        case "thread_reply_created": {
          const payload = event.payload
            ? JSON.parse(event.payload)
            : event.payload;
          if (payload) {
            const reply: ChatMessage = {
              id: payload.id,
              channel_id: payload.channel_id,
              user_id: payload.user_id,
              content: payload.content,
              created_at: payload.created_at,
              updated_at: payload.updated_at,
              deleted_at: payload.deleted_at,
              parent_id: payload.parent_id,
              reply_count: payload.reply_count || 0,
              author_name: payload.author_name,
            };
            // Only add to thread panel if it's for the currently open thread
            if (selectedThreadParentId === payload.parent_id) {
              addThreadReply(reply);
            }
          }
          break;
        }

        // Presence event
        case "presence": {
          const payload = event.payload
            ? JSON.parse(event.payload)
            : event.payload;
          if (payload?.user_id && payload?.status) {
            setUserPresence(payload.user_id, payload.status);
          }
          break;
        }

        // Typing indicator event
        case "typing": {
          const payload = event.payload
            ? JSON.parse(event.payload)
            : event.payload;
          const channelId = event.channel_id;
          if (payload?.user_id && channelId) {
            // The backend doesn't send is_typing, so we infer it:
            // a typing event means the user started typing
            setTyping(channelId, payload.user_id, true);
            // Clear typing status after 3 seconds
            setTimeout(() => {
              setTyping(channelId, payload.user_id, false);
            }, 3000);
          }
          break;
        }

        // Reaction events
        case "reaction_added": {
          const payload = event.payload
            ? JSON.parse(event.payload)
            : event.payload;
          if (payload?.message_id && payload?.user_id && payload?.emoji) {
            updateReactionUI(
              payload.message_id,
              payload.user_id,
              payload.emoji,
            );
          }
          break;
        }

        case "reaction_removed": {
          const payload = event.payload
            ? JSON.parse(event.payload)
            : event.payload;
          if (payload?.message_id && payload?.user_id) {
            updateReactionUI(payload.message_id, payload.user_id);
          }
          break;
        }

        default:
          break;
      }
    } catch (error) {
      console.error("Failed to dispatch WebSocket event:", error);
    }
  }, [
    lastMessage,
    addIncomingMessage,
    addThreadReply,
    setUserPresence,
    setTyping,
    updateReactionUI,
    selectedConversationId,
    selectedThreadParentId,
  ]);
}
