"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useMessageStore } from "@/stores/messageStore";
import { messageService } from "@/features/services/messageService";

export function ChatContainer({ channelId }: { channelId?: string }) {
  const params = useParams();
  const rawChannelId = channelId ?? params?.channelId;
  const resolvedChannelId = Array.isArray(rawChannelId)
    ? rawChannelId[0]
    : rawChannelId;

  if (!resolvedChannelId) {
    return <div className="min-h-[200px] p-4">Loading channel...</div>;
  }

  const baseWsUrl =
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, "ws") ||
    "ws://localhost:8080/ws";
  const wsUrl = `${baseWsUrl.replace(/\/$/, "")}/chat/${resolvedChannelId}`;
  const { lastMessage } = useWebSocket(wsUrl);
  const { messages, setMessages, addMessage } = useMessageStore();

  useEffect(() => {
    messageService
      .getHistory(resolvedChannelId)
      .then((data) => {
        setMessages(
          resolvedChannelId,
          Array.isArray(data) ? data.reverse() : [],
        );
      })
      .catch((err) => {
        console.error("Failed to load history:", err);
      });
  }, [resolvedChannelId, setMessages]);

  useEffect(() => {
    if (lastMessage && lastMessage.channel_id === resolvedChannelId) {
      addMessage(resolvedChannelId, lastMessage);
    }
  }, [lastMessage, resolvedChannelId, addMessage]);

  const channelMessages = messages[resolvedChannelId] || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {channelMessages.map(
          (msg: { id: string; user_id: string; content: string }) => (
            <div key={msg.id} className="p-2 bg-secondary rounded-md">
              <span className="font-bold text-xs">{msg.user_id}: </span>
              <span>{msg.content}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
