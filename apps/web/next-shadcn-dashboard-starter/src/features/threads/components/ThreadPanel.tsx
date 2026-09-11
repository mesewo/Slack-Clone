"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useChatStore } from "@/features/chat/utils/store";
import { messageService } from "@/features/workspace/services/messageService";
import { IconX } from "@tabler/icons-react";
import { AttachmentDownloadButton } from "@/features/chat/components/AttachmentDownloadButton";

interface ThreadPanelProps {
  parentMessage: {
    id: string;
    author: string;
    text: string;
    replyCount?: number;
    attachments?: Array<{
      id: string;
      name: string;
      type: string;
      url?: string;
      thumbnailUrl?: string;
    }>;
  };
}

export function ThreadPanel({ parentMessage }: ThreadPanelProps) {
  const shouldReduceMotion = useReducedMotion();
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
      const reply = selectedConversationId.startsWith("dm:")
        ? await messageService.createDMThreadReply(
            selectedConversationId.slice(3),
            parentMessage.id,
            replyText.trim(),
          )
        : await messageService.createThreadReply(
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
    <motion.aside
      initial={shouldReduceMotion ? false : { opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="border-border bg-background flex h-full w-80 flex-col border-l"
    >
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
        {parentMessage.attachments?.map((attachment) => (
          <div
            key={attachment.id}
            className="mt-2 flex items-center gap-2 rounded-md bg-background/60 p-2"
          >
            {attachment.type.startsWith("image/") && attachment.url ? (
              <img
                src={attachment.thumbnailUrl || attachment.url}
                alt={attachment.name}
                className="size-12 rounded object-cover"
              />
            ) : (
              <span className="text-muted-foreground text-xs">
                {attachment.type || "Attachment"}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs">
              {attachment.name}
            </span>
            {attachment.url && (
              <AttachmentDownloadButton
                id={attachment.id}
                url={attachment.url}
                filename={attachment.name}
                contentType={attachment.type}
              />
            )}
          </div>
        ))}
      </div>

      {/* Thread Replies */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {loadingThreadReplies ? (
          <p className="text-xs text-muted-foreground text-center">
            Loading replies...
          </p>
        ) : threadReplies.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center">
            No replies yet
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {threadReplies.map((reply) => (
              <motion.div
                key={reply.id}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-xs">{reply.author}</span>
                  <span className="text-xs text-muted-foreground">
                    {reply.timestamp}
                  </span>
                </div>
                <p className="text-sm text-foreground">{reply.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>
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
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
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
    </motion.aside>
  );
}
