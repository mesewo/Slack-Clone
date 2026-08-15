// src/features/chat/components/chat-interface.tsx
"use client";

import { useState } from "react";
import { useChat } from "../hooks/use-chat";

interface ChatInterfaceProps {
  roomId: string;
}

export function ChatInterface({ roomId }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isConnected } = useChat(roomId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input.trim());
      setInput("");
    }
  };

  return (
    <div className="flex h-[600px] flex-col rounded-lg border">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.isOwn ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-4 py-2 ${
                message.isOwn
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 dark:bg-gray-800"
              }`}
            >
              <div className="text-sm font-semibold">{message.user}</div>
              <div>{message.content}</div>
              <div className="text-xs opacity-70">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isConnected ? "Type a message..." : "Connecting..."}
            className="flex-1 rounded-md border p-2"
            disabled={!isConnected}
          />
          <button
            type="submit"
            disabled={!isConnected}
            className="rounded-md bg-blue-500 px-4 py-2 text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
