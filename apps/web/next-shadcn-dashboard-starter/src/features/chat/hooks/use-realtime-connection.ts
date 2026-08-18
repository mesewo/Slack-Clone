"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "../utils/store";
import type { ChatMessage } from "@/features/workspace/services/messageService";

type WSEvent = {
  type: "message_created" | "typing" | "presence";
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
export function useRealtimeConnection(enabled: boolean) {
  const addIncomingMessage = useChatStore((s) => s.addIncomingMessage);
  const wsRef = useRef<WebSocket | null>(null);

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

      if (parsed.type === "message_created" && parsed.channel_id) {
        addIncomingMessage(parsed.channel_id, parsed.payload as ChatMessage);
      }
      // typing / presence: wire these up once there's UI to show them
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [enabled, addIncomingMessage]);
}
