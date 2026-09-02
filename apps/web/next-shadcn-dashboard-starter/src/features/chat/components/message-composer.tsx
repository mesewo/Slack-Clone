"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/ui/file-preview";
import type { Attachment } from "../utils/types";

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
];

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
}: MessageComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const renderedDraftRef = useRef<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

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

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-2 sm:space-y-3"
      aria-label="Reply composer"
    >
      <label htmlFor="messenger-editor" className="sr-only">
        Write a message
      </label>
      <div className="border-border/30 bg-background flex items-end gap-1.5 rounded-lg border p-2.5 backdrop-blur-sm sm:gap-2 sm:p-3">
        <div className="min-w-0 flex-1">
          {attachments.length > 0 && (
            <FilePreview
              files={attachments.map((a) => ({
                id: a.id,
                name: a.name,
                type: a.type,
              }))}
              onRemove={onRemoveAttachment}
              className="mb-1 p-0"
            />
          )}
          <div className="border-border/40 bg-muted/40 mb-1.5 flex flex-wrap items-center gap-0.5 rounded-md border p-1 sm:mb-2">
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyFormat("bold")}
              className="hover:bg-accent text-foreground/60 hover:text-foreground rounded px-1.5 py-0.5 text-[0.7rem] font-bold transition"
              aria-label="Bold"
            >
              B
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyFormat("italic")}
              className="hover:bg-accent text-foreground/60 hover:text-foreground rounded px-1.5 py-0.5 text-[0.7rem] italic transition"
              aria-label="Italic"
            >
              I
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyFormat("underline")}
              className="hover:bg-accent text-foreground/60 hover:text-foreground rounded px-1.5 py-0.5 text-[0.7rem] underline transition"
              aria-label="Underline"
            >
              U
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyFormat("strikeThrough")}
              className="hover:bg-accent text-foreground/60 hover:text-foreground rounded px-1.5 py-0.5 text-[0.7rem] line-through transition"
              aria-label="Strikethrough"
            >
              S
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyFormat("formatBlock", "pre")}
              className="hover:bg-accent text-foreground/60 hover:text-foreground rounded px-1.5 py-0.5 text-[0.7rem] font-mono transition"
              aria-label="Inline code"
            >
              {"</>"}
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyFormat("formatBlock", "blockquote")}
              className="hover:bg-accent text-foreground/80 hover:text-foreground rounded px-2 py-1 text-xs"
              aria-label="Quote"
            >
              Quote
            </button>
            <div className="relative ml-auto">
              <button
                type="button"
                onClick={() => setEmojiOpen((current) => !current)}
                className="hover:bg-accent/50 text-foreground/60 hover:text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-sm transition"
                aria-label="Insert emoji"
              >
                <span>😊</span>
              </button>
              {emojiOpen && (
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
                  <div className="flex flex-wrap gap-1">
                    {emojiOptions.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded text-base transition"
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
          <div
            ref={editorRef}
            id="messenger-editor"
            contentEditable
            suppressContentEditableWarning
            onInput={syncDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim() || attachments.length > 0) {
                  const form = e.currentTarget.closest("form");
                  form?.requestSubmit();
                }
              }
            }}
            data-placeholder={`Message ${contactName} (Enter to send, Shift+Enter for newline)`}
            className="text-foreground empty:before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)] min-h-[2.5rem] w-full border-none bg-transparent text-sm outline-none sm:min-h-[3rem]"
            aria-label={"Message " + contactName}
          />
          <div className="mt-1 flex flex-wrap gap-1 sm:mt-1.5 sm:gap-1.5">
            {quickReplies.map((reply) => (
              <button
                key={reply}
                type="button"
                onClick={() => onDraftChange(reply)}
                className="border-border/40 bg-muted/50 text-muted-foreground hover:border-primary/30 hover:text-foreground focus-visible:ring-primary/30 focus-visible:ring-offset-background rounded-full border px-2 py-0.5 text-[0.6rem] transition focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-none sm:px-2 sm:py-0.5 sm:text-[0.65rem]"
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
                onAddAttachments(e.target.files);
              }
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className="border-border/30 bg-muted/40 text-muted-foreground hover:bg-muted/60 focus-visible:ring-primary/30 focus-visible:ring-offset-background size-7 rounded transition focus-visible:ring-1 focus-visible:ring-offset-1 sm:size-8"
            aria-label="Attach a file"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icons.paperclip className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <Button
            type="submit"
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2 sm:text-sm"
            disabled={!draft.trim() && attachments.length === 0}
            aria-label="Send message"
          >
            Send
          </Button>
        </div>
      </div>
    </form>
  );
}
