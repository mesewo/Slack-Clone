"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChatStore } from "../utils/store";
import type { ChatMessage } from "@/features/workspace/services/messageService";
import { useNotificationStore } from "@/features/notifications/utils/store";
import { toast } from "sonner";

type WSEvent = {
  type: string;
  channel_id?: string;
  payload: unknown;
};

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8081/ws";

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
  const updateIncomingMessage = useChatStore((s) => s.updateIncomingMessage);
  const addThreadReply = useChatStore((s) => s.addThreadReply);
  const removeIncomingMessage = useChatStore((s) => s.removeIncomingMessage);
  const setUserPresence = useChatStore((s) => s.setUserPresence);
  const setTyping = useChatStore((s) => s.setTyping);
  const updateReactionUI = useChatStore((s) => s.updateReactionUI);
  const currentUserId = useChatStore((s) => s.currentUserId);
  const selectedThreadParentId = useChatStore((s) => s.selectedThreadParentId);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const refreshDMs = useChatStore((s) => s.refreshDMs);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const currentUserIdRef = useRef(currentUserId);
  const selectedThreadParentIdRef = useRef(selectedThreadParentId);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
    selectedThreadParentIdRef.current = selectedThreadParentId;
  }, [currentUserId, selectedThreadParentId]);
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

    let disposed = false;
    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
      };

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
              const message = parsed.payload as ChatMessage;
              if (parsed.channel_id.startsWith("dm:")) {
                void refreshDMs().then(() => {
                  addIncomingMessage(parsed.channel_id!, message);
                });
              } else {
                addIncomingMessage(parsed.channel_id, message);
              }
              if (message.user_id !== currentUserIdRef.current) {
                const author = message.author_name || "Someone";
                const preview = message.content.slice(0, 100);
                addNotification({
                  id: `realtime-${message.id}`,
                  title: "New message",
                  body: `${author}: ${preview}`,
                  createdAt: message.created_at,
                  actions: [
                    {
                      id: "open-chat",
                      label: "Open chat",
                      type: "redirect",
                      style: "primary",
                    },
                  ],
                });
                toast(`${author} sent a message`, {
                  description: preview,
                  action: {
                    label: "Open chat",
                    onClick: () => {
                      window.localStorage.setItem(
                        "slack_last_conversation_id",
                        parsed.channel_id!,
                      );
                      const workspaceId = window.localStorage.getItem(
                        "active_workspace_id",
                      );
                      const target = parsed.channel_id!.startsWith("dm:")
                        ? `/workspace/${workspaceId}/dms/${parsed.channel_id!.slice(3)}`
                        : `/workspace/${workspaceId}/channels/${parsed.channel_id}`;
                      if (!workspaceId || window.location.pathname !== target) {
                        window.location.assign(
                          workspaceId ? target : "/dashboard/workspaces",
                        );
                      } else {
                        useChatStore
                          .getState()
                          .selectConversation(parsed.channel_id!);
                      }
                    },
                  },
                });
              }
            }
            break;
          }

          case "message_edited": {
            const payload = parsed.payload as {
              message_id?: string;
              content?: string;
            };
            if (
              parsed.channel_id &&
              payload?.message_id &&
              typeof payload.content === "string"
            ) {
              updateIncomingMessage(
                parsed.channel_id,
                payload.message_id,
                payload.content,
              );
            }
            break;
          }

          case "message_deleted": {
            const payload = parsed.payload as { message_id?: string };
            if (parsed.channel_id && payload?.message_id) {
              removeIncomingMessage(parsed.channel_id, payload.message_id);
            }
            break;
          }

          // Thread reply event - display in thread panel if open
          case "thread_reply_created": {
            const payload = parsed.payload as ChatMessage & {
              parent_id?: string;
            };
            if (
              payload &&
              selectedThreadParentIdRef.current === payload.parent_id
            ) {
              addThreadReply(payload as ChatMessage);
            }
            if (
              payload?.user_id &&
              payload.user_id !== currentUserIdRef.current
            ) {
              const author = payload.author_name || "Someone";
              addNotification({
                id: `thread-${payload.id}`,
                title: "New thread reply",
                body: `${author}: ${payload.content}`,
                createdAt: payload.created_at,
                entityId: parsed.channel_id,
                actions: [
                  {
                    id: "open-chat",
                    label: "Open",
                    type: "redirect",
                    style: "primary",
                  },
                ],
              });
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
            const payload = parsed.payload as {
              message_id?: string;
              user_id?: string;
              emoji?: string;
            };
            if (payload?.message_id && payload?.user_id && payload?.emoji) {
              updateReactionUI(
                payload.message_id,
                payload.user_id,
                payload.emoji,
              );
              if (payload.user_id !== currentUserIdRef.current) {
                addNotification({
                  id: `reaction-${payload.message_id}-${payload.user_id}`,
                  title: "New reaction",
                  body: `${payload.emoji} was added to a message`,
                  createdAt: new Date().toISOString(),
                  entityId: parsed.channel_id,
                  actions: [
                    {
                      id: "open-chat",
                      label: "Open",
                      type: "redirect",
                      style: "primary",
                    },
                  ],
                });
              }
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

      ws.onclose = () => {
        if (disposed) return;
        const attempt = reconnectAttemptRef.current++;
        const delay = Math.min(30_000, 1_000 * 2 ** attempt);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [
    enabled,
    addIncomingMessage,
    updateIncomingMessage,
    removeIncomingMessage,
    addThreadReply,
    setUserPresence,
    setTyping,
    updateReactionUI,
    addNotification,
    refreshDMs,
  ]);

  return { sendTyping };
}
