"use client";

import { Icons } from "@/components/icons";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { FilePreview } from "@/components/ui/file-preview";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertModal } from "@/components/modal/alert-modal";
import { toast } from "sonner";
import type { Message } from "../utils/types";
import { productivityService } from "@/features/workspace/services/productivityService";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RichMessageEditor } from "./RichMessageEditor";
import { IconMoodSmile } from "@tabler/icons-react";
import { EmojiPicker } from "./emoji-picker";
import { getFrequentlyUsedEmojis, trackEmojiUsage } from "../utils/emoji-frequency";
import { UserProfilePopover } from "./user-profile-popover";

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

async function copyTextToClipboard(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error("Clipboard access is unavailable.");
  }
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
  isPinned?: boolean;
  onTogglePin?: (messageId: string) => Promise<void>;
  pinTargetLabel?: string;
  compact?: boolean;
  onStartDM?: (userId: string) => void;
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
  isPinned = false,
  onTogglePin,
  pinTargetLabel = "channel",
  compact = false,
  onStartDM,
}: MessageBubbleProps) {
  const shouldReduceMotion = useReducedMotion();
  const isUser = message.sender === "user";
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [quickEmojis, setQuickEmojis] = useState<string[]>(["👍", "❤️", "😂"]);
  const [isSaved, setIsSaved] = useState(false);
  const [editDraft, setEditDraft] = useState(message.text);
  const [currentAvatar, setCurrentAvatar] = useState("");

  useEffect(() => {
    const updateAvatar = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setCurrentAvatar(detail ?? window.localStorage.getItem("slack_profile_avatar") ?? "");
    };
    setCurrentAvatar(window.localStorage.getItem("slack_profile_avatar") ?? "");
    window.addEventListener("slack:avatar-updated", updateAvatar);
    return () => window.removeEventListener("slack:avatar-updated", updateAvatar);
  }, []);

  useEffect(() => {
    const updateQuick = () => {
      const frequent = getFrequentlyUsedEmojis(3);
      if (frequent.length > 0) {
        setQuickEmojis(frequent.map((f) => f.emoji));
      }
    };
    updateQuick();
    window.addEventListener("emoji_frequency_updated", updateQuick);
    return () => window.removeEventListener("emoji_frequency_updated", updateQuick);
  }, []);

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
        "group/message relative flex w-full max-w-[85%] gap-2 px-2 py-1 transition-colors hover:bg-muted/35",
        isUser && "flex-row-reverse",
        isUser && "ml-auto",
        compact && (isUser ? "pr-8" : "pl-8"),
        !compact && "mt-2",
      )}
      role="group"
      id={`message-${message.id}`}
      data-message-id={message.id}
      aria-label={message.author + " at " + message.timestamp}
    >
      {!compact && (
        <UserProfilePopover
          userId={message.userId}
          author={message.author}
          avatarUrl={isUser ? currentAvatar : undefined}
          isCurrentUser={isUser}
          onStartDM={onStartDM}
        >
          <Avatar
            className={cn(
              "mt-0.5 size-8 shrink-0 rounded-md cursor-pointer transition-transform hover:scale-105 hover:ring-2 hover:ring-primary/40",
            )}
            title={`View profile of ${message.author}`}
          >
            {isUser && currentAvatar && <AvatarImage src={currentAvatar} alt={message.author} />}
            <AvatarFallback className="bg-primary/15 text-primary rounded-md text-[0.65rem] font-semibold">
              {message.author.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </UserProfilePopover>
      )}
      <div
        className={cn(
          "relative min-w-0 max-w-[calc(100%-2.5rem)] flex-none py-0.5 text-xs leading-relaxed sm:text-sm",
          isUser ? "text-foreground" : "text-foreground",
        )}
      >
        <div className="absolute top-0 right-2 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-border/80 bg-background/95 p-0.5 opacity-0 shadow-md transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
          {/* Quick Reaction shortcuts (Slack-style top frequent emojis) */}
          {quickEmojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              title={`React with ${emoji}`}
              aria-label={`React with ${emoji}`}
              onClick={() => {
                trackEmojiUsage(emoji);
                onToggleReaction(message.id, emoji);
              }}
              className="hover:bg-accent focus-visible:ring-ring rounded p-1 text-sm outline-none transition hover:scale-125 focus-visible:ring-2"
            >
              {emoji}
            </button>
          ))}

          {/* Full Emoji Picker Popover */}
          <Popover open={reactionPickerOpen} onOpenChange={setReactionPickerOpen}>
            <PopoverTrigger render={<button
              type="button"
              title="Add reaction"
              aria-label="Add reaction"
              aria-expanded={reactionPickerOpen}
              onClick={() => setReactionPickerOpen((open) => !open)}
              className="hover:bg-accent focus-visible:ring-ring rounded p-1.5 outline-none focus-visible:ring-2"
            />}>
              <IconMoodSmile className="size-3.5 text-muted-foreground hover:text-foreground" />
            </PopoverTrigger>
            <PopoverContent side="top" align="end" sideOffset={8} className="w-auto p-0 border-none shadow-2xl bg-transparent">
              <EmojiPicker
                onSelect={(emoji) => {
                  onToggleReaction(message.id, emoji);
                  setReactionPickerOpen(false);
                }}
                onClose={() => setReactionPickerOpen(false)}
              />
            </PopoverContent>
          </Popover>

          {/* Reply in thread */}
          <button
            type="button"
            title="Reply in thread"
            aria-label="Reply in thread"
            onClick={() => onOpenThread(message)}
            className="hover:bg-accent focus-visible:ring-ring rounded p-1.5 outline-none focus-visible:ring-2"
          >
            <Icons.chat className="size-3.5" />
          </button>

          {/* More message actions */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger render={<button
              type="button"
              title="More message actions"
              aria-label="More message actions"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="hover:bg-accent focus-visible:ring-ring rounded p-1.5 outline-none focus-visible:ring-2"
            />}>
            <Icons.ellipsis className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent side="bottom" align={isUser ? "end" : "start"} sideOffset={6} className="min-w-52 p-1 shadow-[var(--shadow-menu)]">
              <div role="menu" className="flex min-w-52 flex-col text-popover-foreground">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); toggleSaved(); }} className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground">{isSaved ? "Remove saved item" : "Save this message for later"}</button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenThread(message); }} className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground">{message.replyCount ? `${message.replyCount} replies` : "Reply in thread"}</button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onToggleThreadSubscription?.(message.id); }} className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground">Follow thread</button>
                <button type="button" role="menuitem" onClick={() => { void copyTextToClipboard(message.text, "Text copied"); setMenuOpen(false); }} className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground">Copy text</button>
                <button type="button" role="menuitem" onClick={() => { void copyTextToClipboard(`${window.location.origin}${window.location.pathname}#message-${message.id}`, "Message link copied"); setMenuOpen(false); }} className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground">Copy link to message</button>
                {onTogglePin && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void onTogglePin(message.id).then(() => toast.success(isPinned ? "Message unpinned" : "Message pinned")).catch(() => toast.error("Couldn't update pinned message")); }} className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground">{isPinned ? `Unpin from ${pinTargetLabel}` : `Pin to ${pinTargetLabel}`}</button>}
                {isUser && <>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setIsEditing(true); }} className="rounded-md px-3 py-2 text-left text-popover-foreground hover:bg-accent hover:text-accent-foreground">Edit message</button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setIsDeleteDialogOpen(true); }} className="rounded-md px-3 py-2 text-left text-destructive hover:bg-destructive/10">Delete message</button>
                </>}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {!compact && (
          <div className="flex items-baseline gap-1.5">
            <UserProfilePopover
              userId={message.userId}
              author={message.author}
              isCurrentUser={isUser}
              onStartDM={onStartDM}
            >
              <button
                type="button"
                className="text-foreground hover:underline text-xs font-bold sm:text-sm text-left focus:outline-none cursor-pointer"
                title={`View profile of ${message.author}`}
              >
                {message.author}
              </button>
            </UserProfilePopover>
            <span className="text-muted-foreground text-[0.65rem] font-normal">
              {message.timestamp}
            </span>
          </div>
        )}
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <RichMessageEditor
              initialValue={message.text}
              onChange={setEditDraft}
              autoFocus
              placeholder="Edit message"
              ariaLabel="Edit message"
              showToolbar
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
        {message.replyCount ? (
          <button
            type="button"
            onClick={() => onOpenThread(message)}
            className="text-primary hover:bg-primary/10 mt-1.5 rounded-full border border-primary/20 px-2 py-0.5 text-xs font-medium"
            aria-label={`${message.replyCount} replies`}
          >
            {message.replyCount} replies
          </button>
        ) : null}
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
            <button
              type="button"
              onClick={() => setReactionPickerOpen(true)}
              aria-label="Add reaction"
              title="Add reaction"
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                isUser ? "border-primary-foreground/30" : "border-border",
              )}
            >
              <IconMoodSmile className="size-3" /> +
            </button>
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
