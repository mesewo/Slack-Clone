"use client";

import { useState } from "react";
import { useChatStore } from "@/features/chat/utils/store";
import { messageService } from "@/features/workspace/services/messageService";
import { IconX } from "@tabler/icons-react";

interface ThreadPanelProps {
  parentMessage: {
    id: string;
    author: string;
    text: string;
    replyCount?: number;
  };
}

export function ThreadPanel({ parentMessage }: ThreadPanelProps) {
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const {
    selectedConversationId,
    threadReplies,
    loadingThreadReplies,
    addThreadReply,
    closeThreadPanel,
  } = useChatStore();

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedConversationId) return;

    setSending(true);
    try {
      const reply = await messageService.createThreadReply(
        selectedConversationId,
        parentMessage.id,
        replyText.trim(),
      );
      addThreadReply(reply);
      setReplyText("");
    } catch (error) {
      console.error("Failed to send reply:", error);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="flex flex-col h-full border-l border-border bg-background w-80">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="font-semibold text-sm">Thread</h2>
        <button
          onClick={closeThreadPanel}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close thread"
        >
          <IconX className="w-4 h-4" />
        </button>
      </div>

      {/* Parent Message */}
      <div className="p-4 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold text-xs text-foreground">
            {parentMessage.author}
          </span>
          <span className="text-xs text-muted-foreground">
            {parentMessage.replyCount || 0} replies
          </span>
        </div>
        <p className="text-sm text-foreground">{parentMessage.text}</p>
      </div>

      {/* Thread Replies */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingThreadReplies ? (
          <p className="text-xs text-muted-foreground text-center">
            Loading replies...
          </p>
        ) : threadReplies.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center">
            No replies yet
          </p>
        ) : (
          threadReplies.map((reply) => (
            <div key={reply.id} className="text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-xs">{reply.author}</span>
                <span className="text-xs text-muted-foreground">
                  {reply.timestamp}
                </span>
              </div>
              <p className="text-sm text-foreground">{reply.text}</p>
            </div>
          ))
        )}
      </div>

      {/* Reply Input */}
      <form
        onSubmit={handleSendReply}
        className="p-4 border-t border-border space-y-3"
      >
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Reply in thread..."
          rows={3}
          className="w-full px-3 py-2 text-sm rounded-md bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
        <button
          type="submit"
          disabled={sending || !replyText.trim()}
          className="w-full px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? "Sending..." : "Send Reply"}
        </button>
      </form>
    </aside>
  );
}
