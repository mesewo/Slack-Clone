"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/ui/file-preview";
import type { Attachment } from "../utils/types";
import { toast } from "sonner";

// File upload validation constants
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const ALLOWED_FILE_TYPES = {
  images: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ],
  videos: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"],
  documents: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  general: ["*/*"],
};

const validateFiles = (
  files: FileList,
): { valid: File[]; errors: string[] } => {
  const valid: File[] = [];
  const errors: string[] = [];
  const supportedMimes = [
    ...ALLOWED_FILE_TYPES.images,
    ...ALLOWED_FILE_TYPES.videos,
    ...ALLOWED_FILE_TYPES.documents,
  ];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      errors.push(
        `${file.name} exceeds the ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB file size limit (${(file.size / (1024 * 1024)).toFixed(2)}MB)`,
      );
      continue;
    }

    // Check MIME type
    if (!supportedMimes.includes(file.type) && file.type !== "") {
      errors.push(
        `${file.name} has unsupported file type "${file.type}". Supported: images, videos, and documents`,
      );
      continue;
    }

    valid.push(file);
  }

  return { valid, errors };
};

const emojiOptions = [
  "👍",
  "🎉",
  "✅",
  "🔥",
  "🚀",
  "🎯",
  "❤️",
  "👏",
  "🙌",
  "😄",
  "😍",
  "😎",
  "😂",
  "🤔",
  "💡",
  "😮",
  "🎁",
  "📌",
  "💬",
  "👀",
  "⚡",
  "🥳",
  "😢",
  "🤣",
  "🥰",
  "🤩",
  "🤯",
  "🤗",
  "😴",
  "😡",
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
  "🌟",
  "💎",
  "🎵",
  "🎮",
  "📎",
  "🔔",
  "📈",
  "🛠️",
  "⏳",
  "❗",
  "❓",
];

const emojiAliases: Record<string, string> = {
  "👍": "thumbs up like",
  "🎉": "party celebrate",
  "✅": "check done yes",
  "🔥": "fire hot",
  "🚀": "rocket launch",
  "❤️": "heart love",
  "😂": "laugh funny joy",
  "😊": "smile happy",
  "🤔": "thinking",
  "😮": "surprised",
  "😢": "sad cry",
  "👏": "clap applause",
  "👀": "eyes look",
  "💡": "idea lightbulb",
};

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markdownToHtml(text: string) {
  return escapeHtml(text)
    .replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeName === "BR") return "\n";

  const content = Array.from(node.childNodes).map(nodeToMarkdown).join("");
  switch (node.nodeName) {
    case "STRONG":
    case "B":
      return `**${content}**`;
    case "EM":
    case "I":
      return `*${content}*`;
    case "U":
      return `__${content}__`;
    case "S":
    case "DEL":
      return `~~${content}~~`;
    case "CODE":
      return `\`${content}\``;
    case "BLOCKQUOTE":
      return content
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "PRE":
      return `\`${content}\``;
    case "DIV":
    case "P":
      return `${content}\n`;
    default:
      return content;
  }
}

interface MessageComposerProps {
  draft: string;
  onDraftChange: (text: string) => void;
  onTyping?: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  contactName: string;
  quickReplies: string[];
  attachments: Attachment[];
  onAddAttachments: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  isUploading?: boolean;
  mentionSuggestions?: string[];
  onSchedule?: (scheduledFor: string) => Promise<void>;
}

export function MessageComposer({
  draft,
  onDraftChange,
  onTyping,
  onSubmit,
  contactName,
  quickReplies,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  isUploading = false,
  mentionSuggestions = [],
  onSchedule,
}: MessageComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const renderedDraftRef = useRef<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [formatterOpen, setFormatterOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const mentionMatch = draft.match(/(^|\s)@([\w-]*)$/);
  const mentionQuery = mentionMatch?.[2].toLowerCase() ?? "";
  const visibleMentions = mentionMatch
    ? mentionSuggestions.filter((suggestion) =>
        suggestion.toLowerCase().startsWith(mentionQuery),
      )
    : [];

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || renderedDraftRef.current === draft) return;
    editor.innerHTML = markdownToHtml(draft);
    renderedDraftRef.current = draft;
  }, [draft]);

  const syncDraft = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextDraft = nodeToMarkdown(editor).replace(/\n+$/, "");
    renderedDraftRef.current = nextDraft;
    onDraftChange(nextDraft);
    onTyping?.();
  };

  const applyFormat = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncDraft();
  };

  const insertEmoji = (emoji: string) => {
    const editor = editorRef.current;
    if (!editor) {
      onDraftChange(`${draft}${emoji} `);
      return;
    }
    editor.focus();
    document.execCommand("insertText", false, `${emoji} `);
    syncDraft();
    setEmojiOpen(false);
  };

  const insertMention = (mention: string) => {
    const editor = editorRef.current;
    if (!editor || !mentionMatch) return;
    editor.focus();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range) {
      range.deleteContents();
      range.insertNode(document.createTextNode(`@${mention} `));
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      document.execCommand("insertText", false, `@${mention} `);
    }
    syncDraft();
  };

  return (
    <form
      onSubmit={onSubmit}
      className={`group/composer sticky bottom-0 z-10 relative space-y-2 border-t border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)] px-3 pt-3 pb-3 text-slate-100 transition-[height] duration-200 ease-out sm:space-y-3 sm:px-4 ${expanded ? "h-[60%] min-h-[12rem] max-h-[60vh]" : "h-auto"}`}
      aria-label="Reply composer"
    >
      <label htmlFor="messenger-editor" className="sr-only">
        Write a message
      </label>
      <div className="flex items-end gap-1.5 rounded-[18px] border border-white/10 bg-slate-950/30 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_18px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:gap-2 sm:p-3">
        <div className="min-w-0 flex-1">
          {attachments.length > 0 && (
            <FilePreview
              files={attachments.map((a) => ({
                id: a.id,
                name: a.name,
                type: a.type,
                url: a.url,
                isUploading: a.isUploading,
              }))}
              onRemove={onRemoveAttachment}
              className="mb-1 p-0"
              mode="compose"
            />
          )}
          {isUploading && (
            <div
              className="text-muted-foreground mb-2 flex items-center gap-2 px-1 text-xs"
              role="status"
              aria-live="polite"
            >
              <Icons.spinner className="size-3.5 animate-spin" />
              Uploading {attachments.length} attachment
              {attachments.length === 1 ? "" : "s"}...
            </div>
          )}
          {formatterOpen && (
            <div className="border-border/60 bg-background/70 mb-1.5 flex flex-wrap items-center gap-0.5 rounded-xl border p-1 shadow-inner shadow-black/5 sm:mb-2">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat("bold")}
                className="hover:bg-accent text-foreground/70 hover:text-foreground rounded-md px-1.5 py-0.5 text-[0.7rem] font-bold transition"
                aria-label="Bold"
              >
                B
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat("italic")}
                className="hover:bg-accent text-foreground/70 hover:text-foreground rounded-md px-1.5 py-0.5 text-[0.7rem] italic transition"
                aria-label="Italic"
              >
                I
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat("underline")}
                className="hover:bg-accent text-foreground/70 hover:text-foreground rounded-md px-1.5 py-0.5 text-[0.7rem] underline transition"
                aria-label="Underline"
              >
                U
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat("strikeThrough")}
                className="hover:bg-accent text-foreground/70 hover:text-foreground rounded-md px-1.5 py-0.5 text-[0.7rem] line-through transition"
                aria-label="Strikethrough"
              >
                S
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat("formatBlock", "pre")}
                className="hover:bg-accent text-foreground/70 hover:text-foreground rounded-md px-1.5 py-0.5 text-[0.7rem] font-mono transition"
                aria-label="Inline code"
              >
                {"</>"}
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat("formatBlock", "blockquote")}
                className="hover:bg-accent text-foreground/80 hover:text-foreground rounded-md px-2 py-1 text-xs"
                aria-label="Quote"
              >
                Quote
              </button>
              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setEmojiOpen((current) => !current)}
                  className="hover:bg-accent/70 text-foreground/70 hover:text-foreground flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm transition"
                  aria-label="Insert emoji"
                >
                  <span>😊</span>
                </button>
                {emojiOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-border/70 bg-popover p-1.5 shadow-lg">
                    <button
                      type="button"
                      onClick={() => setEmojiOpen(false)}
                      className="text-muted-foreground hover:bg-accent absolute top-1 right-1 rounded p-1"
                      aria-label="Close emoji picker"
                    >
                      <Icons.close className="size-3" />
                    </button>
                    <input
                      value={emojiSearch}
                      onChange={(event) => setEmojiSearch(event.target.value)}
                      placeholder="Search emoji"
                      aria-label="Search emoji"
                      className="border-border bg-background mb-1 w-full rounded-md border px-2 py-1 pr-7 text-xs outline-none"
                    />
                    <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                      {emojiOptions
                        .filter(
                          (emoji) =>
                            !emojiSearch ||
                            `${emoji} ${emojiAliases[emoji] || ""}`
                              .toLowerCase()
                              .includes(emojiSearch.toLowerCase()),
                        )
                        .map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => insertEmoji(emoji)}
                            className="hover:bg-accent/70 flex h-7 w-7 items-center justify-center rounded-md text-base transition"
                            aria-label={`Insert ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="relative">
            <div
              ref={editorRef}
              id="messenger-editor"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              tabIndex={0}
              onInput={syncDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  const form = event.currentTarget.closest("form");
                  form?.requestSubmit();
                }
              }}
              data-placeholder={`Message ${contactName} (Enter to send, Shift+Enter for newline)`}
              className="text-foreground empty:before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)] min-h-[2.5rem] w-full border-none bg-transparent text-sm outline-none sm:min-h-[3rem]"
              aria-label={"Message " + contactName}
            />
            {visibleMentions.length > 0 && (
              <div className="border-border/70 bg-popover absolute right-0 bottom-full z-30 mb-2 w-56 rounded-xl border p-1 shadow-xl">
                <p className="text-muted-foreground px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em]">
                  Mention someone
                </p>
                {visibleMentions.slice(0, 6).map((mention) => (
                  <button
                    key={mention}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertMention(mention)}
                    className="hover:bg-accent flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs"
                  >
                    <span className="text-primary mr-1">@</span>
                    {mention}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-white/10 pt-2 sm:gap-1.5">
            <button
              type="button"
              onClick={() => setFormatterOpen((open) => !open)}
              className="text-slate-300 hover:bg-white/10 hover:text-white rounded-md px-2 py-1 text-xs font-semibold"
              aria-label="Toggle formatting toolbar"
              title="Show or hide formatting tools"
            >
              Aa
            </button>
            <button
              type="button"
              onClick={() => {
                editorRef.current?.focus();
                document.execCommand("insertText", false, "@");
                syncDraft();
              }}
              className="text-slate-300 hover:bg-white/10 hover:text-white rounded-md px-2 py-1 text-xs font-semibold"
              aria-label="Mention a user"
              title="Mention a user"
            >
              @
            </button>
            {quickReplies.map((reply) => (
              <button
                key={reply}
                type="button"
                onClick={() => onDraftChange(reply)}
                className="border-white/10 bg-white/5 text-slate-300 hover:border-primary/40 hover:bg-white/10 hover:text-white focus-visible:ring-primary/30 focus-visible:ring-offset-background rounded-full border px-2 py-0.5 text-[0.6rem] transition focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-none sm:px-2 sm:py-0.5 sm:text-[0.65rem]"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 sm:w-24 sm:gap-2">
          <input
            ref={fileInputRef}
            aria-label="Add attachments"
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                const { valid, errors } = validateFiles(e.target.files);

                if (errors.length > 0) {
                  errors.forEach((error) => {
                    toast.error(error);
                  });
                }

                if (valid.length > 0) {
                  onAddAttachments(e.target.files);
                }
              }
              e.target.value = "";
            }}
          />
          <div className="relative flex items-center">
            <Button
              type="button"
              className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:ring-primary/30 focus-visible:ring-offset-background size-8 rounded-r-none rounded-l-xl border-r-0 transition focus-visible:ring-1 focus-visible:ring-offset-1"
              aria-label="Attach content"
              title="Attach content"
              aria-expanded={attachOpen}
              onClick={() => setAttachOpen((open) => !open)}
            >
              <Icons.add className="size-4" />
            </Button>
            <Button
              type="button"
              className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:ring-primary/30 focus-visible:ring-offset-background size-8 rounded-l-none rounded-r-xl border transition focus-visible:ring-1 focus-visible:ring-offset-1"
              aria-label="More composer options"
              title="More composer options"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <Icons.ellipsis className="size-3.5" />
            </Button>
            {attachOpen && (
              <div className="border-border bg-popover absolute right-0 bottom-10 z-30 w-48 rounded-xl border p-1 shadow-xl">
                {[
                  ["image/*", "Images", "Choose images"],
                  ["video/*", "Videos", "Choose videos"],
                  ["application/pdf", "PDF", "Choose PDF files"],
                  ["*/*", "Files", "Choose files"],
                ].map(([accept, label, ariaLabel]) => (
                  <button
                    key={accept}
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.setAttribute("accept", accept);
                      fileInputRef.current?.click();
                      setAttachOpen(false);
                    }}
                    className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs"
                  >
                    <Icons.paperclip className="size-3.5" />
                    <span aria-label={ariaLabel}>{label}</span>
                  </button>
                ))}
              </div>
            )}
            {moreOpen && (
              <div className="border-border bg-popover absolute right-0 bottom-10 z-30 w-48 rounded-xl border p-1 shadow-xl">
                {["Poll", "Canvas", "Location", "Workflow"].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      toast.info(`${label} is not available yet`);
                      setMoreOpen(false);
                    }}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground w-full rounded-lg px-2 py-2 text-left text-xs"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center">
            <Button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-10 shrink-0 rounded-r-none rounded-l-2xl shadow-[0_8px_16px_rgba(99,102,241,0.25)] sm:h-11 sm:w-11"
              disabled={
                isUploading || (!draft.trim() && attachments.length === 0)
              }
              aria-label="Send message"
            >
              <Icons.send className="size-4" />
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-7 rounded-l-none rounded-r-2xl border-l border-primary-foreground/30 px-0 sm:h-11"
              aria-label="Schedule message"
              title="Schedule message"
              onClick={() => setScheduleOpen((open) => !open)}
            >
              <Icons.chevronDown className="size-3.5" />
            </Button>
          </div>
          {scheduleOpen && (
            <div className="border-border bg-popover absolute right-3 bottom-16 z-30 w-56 rounded-xl border p-2 shadow-xl">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Schedule message</p>
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  aria-label="Close schedule picker"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Icons.close className="size-3.5" />
                </button>
              </div>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                className="border-border bg-background mt-2 w-full rounded-md border px-2 py-1 text-xs"
              />
              <Button
                type="button"
                size="sm"
                className="mt-2 w-full"
                disabled={!scheduledFor || !draft.trim() || !onSchedule}
                onClick={async () => {
                  await onSchedule?.(new Date(scheduledFor).toISOString());
                  setScheduleOpen(false);
                  setScheduledFor("");
                }}
              >
                Schedule
              </Button>
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute right-3 top-0 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover/composer:pointer-events-auto group-hover/composer:opacity-100">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="border-border bg-background text-muted-foreground hover:text-foreground rounded-md border px-1.5 py-0.5 text-xs"
            aria-label={expanded ? "Collapse composer" : "Expand composer"}
            title={expanded ? "Collapse composer" : "Expand composer"}
          >
            {expanded ? "⇅" : "↕"}
          </button>
        </div>
      </div>
    </form>
  );
}
