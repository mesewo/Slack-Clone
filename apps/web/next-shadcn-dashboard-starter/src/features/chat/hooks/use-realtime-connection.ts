"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChatStore } from "../utils/store";
import type { ChatMessage } from "@/features/workspace/services/messageService";

type WSEvent = {
  type: string;
  channel_id?: string;
  payload: unknown;
};

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws";

// One connection for the whole session, not one per open room - the backend
// (gateway.ServeWS) already subscribes this user to every channel they're a
// member of when the connection opens, so there's no per-room reconnect
// needed the way the old use-chat.ts did it.
//
// No manual auth handshake either: the browser attaches the HttpOnly auth
// cookie to this upgrade request automatically, and the Go handler reads it
// straight off the request headers.
export function useRealtimeConnection(enabled: boolean, connectionKey = "") {
  const addIncomingMessage = useChatStore((s) => s.addIncomingMessage);
  const addThreadReply = useChatStore((s) => s.addThreadReply);
  const setUserPresence = useChatStore((s) => s.setUserPresence);
  const setTyping = useChatStore((s) => s.setTyping);
  const updateReactionUI = useChatStore((s) => s.updateReactionUI);
  const selectedThreadParentId = useChatStore((s) => s.selectedThreadParentId);

  const wsRef = useRef<WebSocket | null>(null);
  const sendTyping = useCallback((channelId: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        type: "typing",
        payload: { channel_id: channelId },
      }),
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      let parsed: WSEvent;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return; // malformed frame, ignore
      }

      switch (parsed.type) {
        // Message event - display in the channel
        case "message_created": {
          if (parsed.channel_id && parsed.payload) {
            addIncomingMessage(
              parsed.channel_id,
              parsed.payload as ChatMessage,
            );
          }
          break;
        }

        // Thread reply event - display in thread panel if open
        case "thread_reply_created": {
          const payload = parsed.payload as any;
          if (payload && selectedThreadParentId === payload.parent_id) {
            addThreadReply(payload as ChatMessage);
          }
          break;
        }

        // Presence event - update user status
        case "presence": {
          const payload = parsed.payload as any;
          if (payload?.user_id && payload?.status) {
            setUserPresence(payload.user_id, payload.status);
          }
          break;
        }

        // Typing indicator event
        case "typing": {
          const payload = parsed.payload as any;
          const channelId = parsed.channel_id;
          if (payload?.user_id && channelId) {
            setTyping(channelId, payload.user_id, true);
            // Clear typing status after 3 seconds of inactivity
            setTimeout(() => {
              setTyping(channelId, payload.user_id, false);
            }, 3000);
          }
          break;
        }

        // Reaction added event
        case "reaction_added": {
          const payload = parsed.payload as any;
          if (payload?.message_id && payload?.user_id && payload?.emoji) {
            updateReactionUI(
              payload.message_id,
              payload.user_id,
              payload.emoji,
            );
          }
          break;
        }

        // Reaction removed event
        case "reaction_removed": {
          const payload = parsed.payload as any;
          if (payload?.message_id && payload?.user_id) {
            updateReactionUI(payload.message_id, payload.user_id);
          }
          break;
        }

        default:
          break;
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [
    enabled,
    connectionKey,
    addIncomingMessage,
    addThreadReply,
    setUserPresence,
    setTyping,
    updateReactionUI,
  ]);

  return { sendTyping };
}
