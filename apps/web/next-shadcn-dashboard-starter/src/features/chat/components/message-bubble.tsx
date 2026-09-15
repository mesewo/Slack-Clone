"use client";

import { Icons } from "@/components/icons";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FilePreview } from "@/components/ui/file-preview";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertModal } from "@/components/modal/alert-modal";
import { toast } from "sonner";
import type { Message } from "../utils/types";
import { productivityService } from "@/features/workspace/services/productivityService";

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

const reactionAliases: Record<string, string> = {
  "👍": "thumbs up like",
  "🎉": "party celebrate",
  "✅": "check done yes",
  "🔥": "fire hot",
  "🚀": "rocket launch",
  "❤️": "heart love",
  "😂": "laugh funny",
  "😊": "smile happy",
  "🤔": "thinking",
  "😮": "surprised",
  "😢": "sad cry",
  "👏": "clap applause",
  "👀": "eyes look",
  "💡": "idea lightbulb",
};

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
  onToggleThreadSubscription?: (messageId: string) => void;
  compact?: boolean;
}

export function MessageBubble({
  message,
  onOpenThread,
  reactions,
  currentUserId,
  onToggleReaction,
  onEdit,
  onDelete,
  onToggleThreadSubscription,
  compact = false,
}: MessageBubbleProps) {
  const shouldReduceMotion = useReducedMotion();
  const isUser = message.sender === "user";
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [reactionSearch, setReactionSearch] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [editDraft, setEditDraft] = useState(message.text);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const hasMention = /(^|\s)@\w+/.test(message.text);

  useEffect(() => {
    setEditDraft(message.text);
  }, [message.text]);

  useEffect(() => {
    void productivityService
      .listSavedMessages()
      .then((items) =>
        setIsSaved(items.some((item) => item.message_id === message.id)),
      )
      .catch(() => {
        const savedMessages = JSON.parse(
          window.localStorage.getItem("slack_saved_messages") || "[]",
        ) as string[];
        setIsSaved(savedMessages.includes(message.id));
      });
  }, [message.id]);

  const toggleSaved = () => {
    void (isSaved
      ? productivityService.unsaveMessage(message.id)
      : productivityService.saveMessage(message.id));
    setIsSaved(!isSaved);
    toast.success(isSaved ? "Removed from Later" : "Saved to Later");
  };

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
      className={cn(
        "group/message relative flex w-full max-w-[85%] gap-2 px-2 py-0.5 transition-colors hover:bg-muted/40",
        isUser && "flex-row-reverse",
        isUser && "ml-auto",
        compact && (isUser ? "pr-10" : "pl-10"),
        !compact && "mt-2",
      )}
      role="group"
      id={`message-${message.id}`}
      data-message-id={message.id}
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
      {!compact && (
        <Avatar className="mt-0.5 size-8 shrink-0 rounded-md">
          <AvatarFallback className="bg-primary/15 text-primary rounded-md text-[0.65rem] font-semibold">
            {message.author.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "relative min-w-0 max-w-[calc(100%-2.5rem)] flex-none py-0.5 text-xs leading-relaxed sm:text-sm",
          isUser ? "text-foreground" : "text-foreground",
        )}
      >
        <div className="absolute top-0 right-1 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
          <button
            type="button"
            title="Reply in thread"
            aria-label="Reply in thread"
            onClick={() => onOpenThread(message)}
            className="hover:bg-accent focus-visible:ring-ring rounded p-1.5 outline-none focus-visible:ring-2"
          >
            <Icons.chat className="size-3.5" />
          </button>
          <button
            type="button"
            title="Add reaction"
            aria-label="Add reaction"
            aria-expanded={reactionPickerOpen}
            onClick={() => setReactionPickerOpen((open) => !open)}
            className="hover:bg-accent focus-visible:ring-ring rounded p-1.5 outline-none focus-visible:ring-2"
          >
            😊
          </button>
          <button
            type="button"
            title="More message actions"
            aria-label="More message actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="hover:bg-accent focus-visible:ring-ring rounded p-1.5 outline-none focus-visible:ring-2"
          >
            <Icons.ellipsis className="size-3.5" />
          </button>
        </div>
        {reactionPickerOpen && (
          <div className="border-border bg-popover absolute top-7 right-1 z-30 w-64 rounded-lg border p-2 shadow-xl">
            <button
              type="button"
              onClick={() => setReactionPickerOpen(false)}
              className="text-muted-foreground hover:bg-accent absolute top-1 right-1 rounded p-1"
              aria-label="Close reaction picker"
            >
              <Icons.close className="size-3" />
            </button>
            <input
              value={reactionSearch}
              onChange={(event) => setReactionSearch(event.target.value)}
              placeholder="Search emoji"
              aria-label="Search reaction emoji"
              className="border-border bg-background mb-1 w-full rounded-md border px-2 py-1 text-xs outline-none"
            />
            <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto pr-1">
              {reactionChoices
                .filter((emoji) =>
                  `${emoji} ${reactionAliases[emoji] || ""}`
                    .toLowerCase()
                    .includes(reactionSearch.toLowerCase()),
                )
                .map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    title={`React ${emoji}`}
                    onClick={() => {
                      onToggleReaction(message.id, emoji);
                      setReactionPickerOpen(false);
                    }}
                    className="hover:bg-accent flex size-7 items-center justify-center rounded text-lg"
                  >
                    {emoji}
                  </button>
                ))}
            </div>
          </div>
        )}
        {!compact && (
          <p className="text-foreground text-xs font-bold sm:text-sm">
            {message.author}{" "}
            <span className="text-muted-foreground ml-1 text-[0.65rem] font-normal">
              {message.timestamp}
            </span>
          </p>
        )}
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
          <>
            {hasMention && (
              <div className="mb-1 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.16em] text-primary">
                Mention
              </div>
            )}
            <div
              className={cn(
                "whitespace-pre-wrap text-[0.875rem] sm:text-[0.95rem]",
              )}
            >
              {renderFormattedText(message.text)}
            </div>
          </>
        ) : null}
        {message.attachments && message.attachments.length > 0 && (
          <FilePreview
            files={message.attachments.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              url: a.url,
              description: a.url,
              size: a.size,
            }))}
            variant={isUser ? "inverted" : "default"}
            className="mt-1 p-0"
            mode="message"
            maxAutoPreviewSize={2 * 1024 * 1024}
          />
        )}
        {compact && (
          <span className="text-muted-foreground ml-1 text-[0.6rem]">
            {message.timestamp}
          </span>
        )}
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
                toggleSaved();
              }}
              className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {isSaved ? "Remove saved item" : "Save for later"}
            </button>
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
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onToggleThreadSubscription?.(message.id);
              }}
              className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Follow thread
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void navigator.clipboard?.writeText(message.text);
                setMenuOpen(false);
              }}
              className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Copy text
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void navigator.clipboard?.writeText(
                  `${window.location.origin}${window.location.pathname}#message-${message.id}`,
                );
                toast.success("Message link copied");
                setMenuOpen(false);
              }}
              className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Copy link to message
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
