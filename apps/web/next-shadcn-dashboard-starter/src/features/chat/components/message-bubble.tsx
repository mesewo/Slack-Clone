"use client";

import { Icons } from "@/components/icons";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FilePreview } from "@/components/ui/file-preview";
import { AlertModal } from "@/components/modal/alert-modal";
import type { Message } from "../utils/types";

const reactionChoices = Array.from(
  new Set([
    "👍",
    "👎",
    "👏",
    "🙌",
    "🙏",
    "💪",
    "🤝",
    "👀",
    "❤️",
    "🧡",
    "💛",
    "💚",
    "💙",
    "💜",
    "🖤",
    "🤍",
    "💔",
    "🔥",
    "✨",
    "⭐",
    "✅",
    "❌",
    "💯",
    "🎉",
    "🎊",
    "🚀",
    "💡",
    "🎯",
    "🏆",
    "😂",
    "🤣",
    "😅",
    "😊",
    "😍",
    "🥰",
    "😘",
    "😎",
    "🤔",
    "😮",
    "😢",
    "😭",
    "😡",
    "🤯",
    "🤗",
    "🥳",
    "😴",
    "🤷",
    "🙈",
    "💀",
    "👻",
    "🤖",
    "🍕",
    "🍔",
    "🍻",
    "☕",
    "🌈",
    "☀️",
    "🌙",
    "🐶",
    "🐱",
    "🦄",
    "🌟",
    "💎",
    "🎵",
    "🎮",
    "📌",
    "📎",
    "🔒",
    "🔑",
    "⚡",
    "❗",
    "❓",
    "💬",
    "📣",
    "🙋",
    "💖",
    "💗",
    "💓",
    "💞",
    "💘",
    "💝",
    "😇",
    "🤩",
    "😋",
    "😜",
    "🤪",
    "😏",
    "😬",
    "😱",
    "🤫",
    "🫡",
    "🫶",
    "🌻",
    "🌸",
    "🍀",
    "🎁",
    "🎈",
    "🥇",
    "🥈",
    "🥉",
    "🔔",
    "📈",
    "🛠️",
    "✅",
    "⏳",
    "🆘",
  ]),
);

function renderFormattedText(text: string): React.ReactNode[] {
  const normalizedText = text.replace(/<u>(.*?)<\/u>/g, "__$1__");
  const segments = normalizedText.split(
    /(\*\*.*?\*\*|__.*?__|~~.*?~~|`.*?`|\*.*?\*|> .*?(?:\n|$))/g,
  );

  return segments.map((segment, index) => {
    if (!segment) return null;

    if (segment.startsWith("**") && segment.endsWith("**")) {
      return (
        <strong key={`${segment}-${index}`}>
          {renderFormattedText(segment.slice(2, -2))}
        </strong>
      );
    }

    if (segment.startsWith("__") && segment.endsWith("__")) {
      return (
        <span key={`${segment}-${index}`} className="underline">
          {renderFormattedText(segment.slice(2, -2))}
        </span>
      );
    }

    if (segment.startsWith("~~") && segment.endsWith("~~")) {
      return (
        <span key={`${segment}-${index}`} className="line-through">
          {renderFormattedText(segment.slice(2, -2))}
        </span>
      );
    }

    if (segment.startsWith("`") && segment.endsWith("`")) {
      return (
        <code
          key={`${segment}-${index}`}
          className="rounded bg-black/5 px-1 py-0.5 text-[0.8em]"
        >
          {segment.slice(1, -1)}
        </code>
      );
    }

    if (
      segment.startsWith("*") &&
      segment.endsWith("*") &&
      segment.length > 2
    ) {
      return (
        <em key={`${segment}-${index}`}>
          {renderFormattedText(segment.slice(1, -1))}
        </em>
      );
    }

    if (segment.startsWith("> ")) {
      return (
        <blockquote
          key={`${segment}-${index}`}
          className="border-l border-current/30 pl-2 italic opacity-80"
        >
          {renderFormattedText(segment.slice(2))}
        </blockquote>
      );
    }

    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

interface MessageBubbleProps {
  message: Message;
  onOpenThread: (message: Message) => void;
  reactions: Array<{ userId: string; emoji: string }>;
  currentUserId: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
}

export function MessageBubble({
  message,
  onOpenThread,
  reactions,
  currentUserId,
  onToggleReaction,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const shouldReduceMotion = useReducedMotion();
  const isUser = message.sender === "user";
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.text);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEditDraft(message.text);
  }, [message.text]);

  const reactionCounts = reactions.reduce<Record<string, number>>(
    (counts, reaction) => ({
      ...counts,
      [reaction.emoji]: (counts[reaction.emoji] || 0) + 1,
    }),
    {},
  );

  const openActions = () => setMenuOpen(true);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenuOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeMenuOutside);
    return () => document.removeEventListener("pointerdown", closeMenuOutside);
  }, [menuOpen]);

  const saveEdit = () => {
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    onEdit(message.id, trimmed);
    setIsEditing(false);
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={
        shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
      }
      exit={{ opacity: 0, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="flex flex-col gap-1"
      role="group"
      aria-label={message.author + " at " + message.timestamp}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, input, textarea"))
          return;
        openActions();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openActions();
      }}
    >
      <div
        className={cn(
          "relative max-w-[85%] rounded-xl border px-3 py-2 text-xs leading-relaxed sm:max-w-[82%] sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm",
          isUser
            ? "border-primary/40 bg-primary text-primary-foreground ml-auto"
            : "bg-muted border-transparent",
        )}
      >
        <p
          className={cn(
            "font-medium sm:text-sm",
            isUser ? "text-primary-foreground/80" : "text-foreground/80",
          )}
        >
          {message.author}
        </p>
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
              rows={3}
              className={cn(
                "w-full resize-none rounded-lg border border-border bg-background/80 p-2 text-[0.875rem] text-foreground outline-none ring-0 placeholder:text-muted-foreground/70",
                isUser && "bg-primary-foreground/10 text-primary-foreground",
              )}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditDraft(message.text);
                }}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        ) : message.text ? (
          <div
            className={cn(
              "mt-1 whitespace-pre-wrap text-[0.875rem] sm:text-[0.95rem]",
              isUser ? "text-primary-foreground/90" : "text-foreground/90",
            )}
          >
            {renderFormattedText(message.text)}
          </div>
        ) : null}
        {message.attachments && message.attachments.length > 0 && (
          <FilePreview
            files={message.attachments.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
            }))}
            variant={isUser ? "inverted" : "default"}
            className="mt-1 p-0"
          />
        )}
        <div className="mt-2 flex items-center justify-end gap-1.5 text-[0.65rem] sm:mt-3 sm:gap-2 sm:text-[0.7rem]">
          <span
            className={cn(
              "text-muted-foreground",
              isUser && "text-primary-foreground/80",
            )}
          >
            {message.timestamp}
          </span>
          {isUser && (
            <Icons.checks
              className="text-primary-foreground/80 h-3 w-3 sm:h-3.5 sm:w-3.5"
              aria-hidden="true"
            />
          )}
        </div>
        {reactions.length > 0 && (
          <div className={cn("mt-2 flex flex-wrap gap-1")}>
            {Object.entries(reactionCounts).map(([emoji, count]) => {
              const hasReaction = reactions.some(
                (reaction) =>
                  reaction.userId === currentUserId && reaction.emoji === emoji,
              );
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onToggleReaction(message.id, emoji)}
                  aria-label={`${hasReaction ? "Remove" : "Add"} ${emoji} reaction, ${count} total`}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground",
                    isUser
                      ? "border-primary-foreground/30 text-primary-foreground/90"
                      : "border-border text-foreground/80",
                    hasReaction &&
                      "bg-accent text-accent-foreground ring-1 ring-primary/50",
                  )}
                >
                  {emoji} {count}
                </button>
              );
            })}
          </div>
        )}
        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            className={cn(
              "absolute z-20 mt-2 flex min-w-52 flex-col rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl",
              isUser ? "right-0" : "left-0",
            )}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onOpenThread(message);
              }}
              className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {message.replyCount
                ? `${message.replyCount} replies`
                : "Reply in thread"}
            </button>
            {isUser && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setIsEditing(true);
                  }}
                  className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  Edit message
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setIsDeleteDialogOpen(true);
                  }}
                  className="rounded-md px-3 py-2 text-left text-destructive hover:bg-destructive/10"
                >
                  Delete message
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <AlertModal
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => {
          setIsDeleteDialogOpen(false);
          onDelete(message.id);
        }}
        loading={false}
        title="Delete message?"
        description="This message will be permanently removed from the conversation."
        confirmLabel="Delete message"
      />
    </motion.div>
  );
}
