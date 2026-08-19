"use client";

import { Icons } from "@/components/icons";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FilePreview } from "@/components/ui/file-preview";
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

interface MessageBubbleProps {
  message: Message;
  onOpenThread: (message: Message) => void;
  reactions: Array<{ userId: string; emoji: string }>;
  currentUserId: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
}

export function MessageBubble({
  message,
  onOpenThread,
  reactions,
  currentUserId,
  onToggleReaction,
}: MessageBubbleProps) {
  const shouldReduceMotion = useReducedMotion();
  const isUser = message.sender === "user";
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionSearch, setReactionSearch] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  const reactionCounts = reactions.reduce<Record<string, number>>(
    (counts, reaction) => ({
      ...counts,
      [reaction.emoji]: (counts[reaction.emoji] || 0) + 1,
    }),
    {},
  );
  const filteredReactionChoices = reactionChoices.filter((emoji) =>
    emoji.includes(reactionSearch.trim()),
  );

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
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
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
        {message.text && (
          <p
            className={cn(
              "mt-1 text-[0.875rem] sm:text-[0.95rem]",
              isUser ? "text-primary-foreground/90" : "text-foreground/90",
            )}
          >
            {message.text}
          </p>
        )}
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
                    "rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground",
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
            onClick={(event) => event.stopPropagation()}
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
            <div className="border-border mt-1 border-t px-2 pb-1 pt-2">
              <input
                type="search"
                value={reactionSearch}
                onChange={(event) => setReactionSearch(event.target.value)}
                placeholder="Search emoji"
                aria-label="Search emoji"
                className="border-border bg-background text-foreground placeholder:text-muted-foreground mb-2 w-full rounded-md border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/40"
              />
              <div className="flex flex-wrap gap-1">
                {filteredReactionChoices.map((emoji) => {
                  const hasReaction = reactions.some(
                    (reaction) =>
                      reaction.userId === currentUserId &&
                      reaction.emoji === emoji,
                  );
                  return (
                    <button
                      key={emoji}
                      type="button"
                      role="menuitem"
                      aria-label={`${hasReaction ? "Remove" : "Add"} ${emoji} reaction`}
                      onClick={() => {
                        setMenuOpen(false);
                        onToggleReaction(message.id, emoji);
                      }}
                      className={cn(
                        "rounded-md px-2 py-1 text-base leading-none hover:bg-accent",
                        hasReaction && "bg-accent ring-1 ring-primary/50",
                      )}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
              {filteredReactionChoices.length === 0 && (
                <p className="text-muted-foreground py-2 text-center text-xs">
                  No matching emoji
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
