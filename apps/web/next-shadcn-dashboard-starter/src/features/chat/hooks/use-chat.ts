// src/features/chat/hooks/use-chat.ts
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

interface Message {
  id: string;
  user: string;
  content: string;
  timestamp: Date;
  isOwn: boolean;
}

export function useChat(roomId: string) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8081/ws/chat/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);

      ws.send(
        JSON.stringify({
          type: "auth",
          token: document.cookie.split("token=")[1]?.split(";")[0],
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "message":
            setMessages((prev) => [
              ...prev,
              {
                id: data.id,
                user: data.user,
                content: data.content,
                timestamp: new Date(data.timestamp),
                isOwn: data.userId === user?.id,
              },
            ]);
            break;
          case "history":
            setMessages(
              data.messages.map((m: any) => ({
                id: m.id,
                user: m.user,
                content: m.content,
                timestamp: new Date(m.timestamp),
                isOwn: m.userId === user?.id,
              })),
            );
            break;
        }
      } catch (error) {
        console.error("Failed to parse message:", error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [roomId, user]);

  const sendMessage = (content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: "message",
        content,
        roomId,
      }),
    );
  };

  return {
    messages,
    sendMessage,
    isConnected,
  };
}
