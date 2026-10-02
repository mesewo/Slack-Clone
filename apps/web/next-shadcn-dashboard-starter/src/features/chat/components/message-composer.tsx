"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/ui/file-preview";
import { RichMessageEditor, type RichMessageEditorHandle } from "./RichMessageEditor";
import type { Attachment } from "../utils/types";
import { toast } from "sonner";
import { IconAt, IconMoodSmile } from "@tabler/icons-react";

// File upload validation constants
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
function toLocalDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

const ALLOWED_FILE_TYPES = {
  images: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ],
  videos: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"],
  audio: ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"],
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
    ...ALLOWED_FILE_TYPES.audio,
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

interface MessageComposerProps {
  draft: string;
  onDraftChange: (text: string) => void;
  onTyping?: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  contactName: string;
  isSelfDM?: boolean;
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
  const editorRef = useRef<RichMessageEditorHandle>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [minimumScheduledFor, setMinimumScheduledFor] = useState("");
  const [formatterOpen, setFormatterOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startAudioRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast.error("Audio recording is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = MediaRecorder.isTypeSupported("audio/webm")
        ? { mimeType: "audio/webm" }
        : undefined;
      const recorder = new MediaRecorder(stream, options);
      const chunks: BlobPart[] = [];
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) {
          const extension = blob.type.includes("ogg")
            ? "ogg"
            : blob.type.includes("mp4")
              ? "mp4"
              : "webm";
          const file = new File([blob], `audio-clip-${Date.now()}.${extension}`, { type: blob.type });
          const transfer = new DataTransfer();
          transfer.items.add(file);
          onAddAttachments(transfer.files);
        }
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
        setAttachOpen(false);
      };
      recorder.start();
      setIsRecording(true);
    } catch {
      toast.error("Couldn't access your microphone.");
    }
  };

  const stopAudioRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const insertEmoji = (emoji: string) => {
    editorRef.current?.insertText(`${emoji} `);
    setEmojiOpen(false);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="group/composer sticky relative bottom-0 z-10 shrink-0 space-y-2 border-t border-border bg-background px-3 pt-3 pb-3 text-foreground sm:space-y-3 sm:px-4"
      aria-label="Reply composer"
    >
      <label htmlFor="messenger-editor" className="sr-only">
        Write a message
      </label>
      <div className="border-border bg-background flex items-end gap-1.5 rounded-[18px] border p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_18px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:gap-2 sm:p-3">
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
          <RichMessageEditor
            ref={editorRef}
            initialValue={draft}
            onChange={onDraftChange}
            onTyping={onTyping}
            autoFocus={false}
            showToolbar={formatterOpen}
            placeholder={`Message ${contactName}`}
            ariaLabel={`Message ${contactName}`}
            expanded={expanded}
            mentionSuggestions={mentionSuggestions}
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2 sm:gap-2">
            <input
              ref={fileInputRef}
              aria-label="Add attachments"
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  const { valid, errors } = validateFiles(e.target.files);
                  errors.forEach((error) => toast.error(error));
                  if (valid.length > 0) onAddAttachments(e.target.files);
                }
                e.target.value = "";
              }}
            />
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                className="size-8 rounded-full bg-zinc-500/25 p-1 text-foreground/80 transition hover:bg-zinc-500/40 hover:text-foreground"
                aria-label="Attach content"
                title="Attach content"
                aria-expanded={attachOpen}
                onClick={() => setAttachOpen((open) => !open)}
              >
                <Icons.add className="size-5" />
              </Button>
              {attachOpen && (
                <div className="border-border bg-popover absolute bottom-10 left-0 z-30 w-48 rounded-xl border p-1 shadow-xl">
                  {isRecording ? (
                    <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs" role="status" aria-live="polite">
                      <span className="size-2 animate-pulse rounded-full bg-red-500" />
                      <span className="flex-1">Recording voice clip</span>
                      <button type="button" onClick={stopAudioRecording} className="text-muted-foreground hover:text-foreground rounded p-1" aria-label="Stop voice clip recording" title="Stop recording">
                        <Icons.close className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <>
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
                      <button type="button" onClick={() => void startAudioRecording()} className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs">
                        <Icons.microphone className="size-3.5" />Voice clip
                      </button>
                      <button type="button" onClick={() => toast.info("Video recording is coming soon.")} className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs">
                        <Icons.video className="size-3.5" />Video clip
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setFormatterOpen((open) => !open)}
                className={`flex size-8 items-center justify-center rounded-md px-1 text-sm font-bold tracking-tight transition-colors hover:bg-muted hover:text-foreground ${formatterOpen ? "bg-muted text-foreground" : "text-foreground/80"}`}
                aria-label="Toggle formatting toolbar"
                aria-pressed={formatterOpen}
                title="Show or hide formatting tools"
              >
                Aa
              </button>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setEmojiOpen((current) => !current)}
                className="flex size-8 items-center justify-center rounded-md text-foreground/80 transition-colors hover:text-[#f2c744]"
                aria-label="Insert emoji"
                title="Insert emoji"
              >
                <IconMoodSmile className="size-5" aria-hidden="true" />
              </button>
              {emojiOpen && (
                <div className="absolute bottom-10 left-0 z-20 w-48 rounded-xl border border-border/70 bg-popover p-1.5 shadow-lg">
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
            <button
              type="button"
              onClick={() => {
                editorRef.current?.insertText("@");
              }}
              className="flex size-8 items-center justify-center rounded-md text-foreground/80 transition-colors hover:text-foreground"
              aria-label="Mention a user"
              title="Mention a user"
            >
              <IconAt className="size-5" aria-hidden="true" />
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
              aria-label="Schedule for later"
              title="Schedule for later"
              aria-expanded={scheduleOpen}
              disabled={isUploading || !draft.trim()}
              onClick={() => {
                if (!scheduleOpen) {
                  const minimum = new Date();
                  minimum.setMinutes(minimum.getMinutes() + 2, 0, 0);
                  const minimumValue = toLocalDateTimeValue(minimum);
                  setMinimumScheduledFor(minimumValue);
                  setScheduledFor(minimumValue);
                }
                setScheduleOpen((open) => !open);
              }}
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
                min={minimumScheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                className="border-border bg-background mt-2 w-full rounded-md border px-2 py-1 text-xs"
              />
              <Button
                type="button"
                size="sm"
                className="mt-2 w-full"
                disabled={
                  !scheduledFor ||
                  new Date(scheduledFor).getTime() <= Date.now() ||
                  !draft.trim() ||
                  !onSchedule
                }
                onClick={async () => {
                  const scheduledTime = new Date(scheduledFor);
                  if (!Number.isFinite(scheduledTime.getTime()) || scheduledTime.getTime() <= Date.now()) {
                    toast.error("Choose a future time to schedule this message.");
                    return;
                  }
                  try {
                    await onSchedule?.(scheduledTime.toISOString());
                    setScheduleOpen(false);
                    setScheduledFor("");
                  } catch (cause) {
                    const message = (cause as { response?: { data?: { error?: string } } })
                      .response?.data?.error;
                    toast.error(message || "Couldn't schedule the message. Please choose a future time and try again.");
                  }
                }}
              >
                Schedule
              </Button>
            </div>
          )}
        </div>
        {/* <div className="pointer-events-none absolute right-3 top-0 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover/composer:pointer-events-auto group-hover/composer:opacity-100">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="border-border bg-background text-muted-foreground hover:text-foreground rounded-md border px-1.5 py-0.5 text-xs"
            aria-label={expanded ? "Collapse composer" : "Expand composer"}
            title={expanded ? "Collapse composer" : "Expand composer"}
          >
            {expanded ? "⇅" : "↕"}
          </button>
        </div> */}
      </div>
    </form>
  );
}
