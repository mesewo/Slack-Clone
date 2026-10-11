"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icons } from "@/components/icons";
import { useChatStore } from "@/features/chat/utils/store";
import { messageService, type ChatMessage, type UploadedAttachment } from "@/features/workspace/services/messageService";
import { AttachmentDownloadButton } from "@/features/chat/components/AttachmentDownloadButton";

type SharedFile = UploadedAttachment & {
  sentAt: string;
  conversationId: string;
  conversationName: string;
};

export function WorkspaceFilesDialog() {
  const conversations = useChatStore((state) => state.conversations);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("All files");

  useEffect(() => {
    const showFiles = () => setOpen(true);
    window.addEventListener("workspace:open-files", showFiles);
    return () => window.removeEventListener("workspace:open-files", showFiles);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all(conversations.map(async (conversation) => {
      const messages: ChatMessage[] = [];
      let before: string | undefined;
      for (let page = 0; page < 100; page += 1) {
        const batch = conversation.kind === "dm" && conversation.dmId
          ? await messageService.listDMMessagesPage(conversation.dmId, { before, limit: 50 })
          : await messageService.list(conversation.id, { before, limit: 50 });
        messages.push(...batch);
        if (batch.length < 50) break;
        before = batch[batch.length - 1]?.created_at;
        if (!before) break;
      }
      return messages.flatMap((message) => (message.attachments ?? []).map((file) => ({
        ...file,
        sentAt: message.created_at,
        conversationId: conversation.id,
        conversationName: conversation.name,
      })));
    })).then((result) => {
      if (!cancelled) setFiles(result.flat().sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt)));
    }).catch(() => {
      if (!cancelled) setFiles([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [conversations, open]);

  const visibleFiles = files.filter((file) => {
    if (filter === "Images") return file.content_type.startsWith("image/");
    if (filter === "Videos") return file.content_type.startsWith("video/");
    if (filter === "Documents") return !file.content_type.startsWith("image/") && !file.content_type.startsWith("video/");
    if (filter === "Downloaded") {
      if (typeof window === "undefined") return false;
      try {
        return (JSON.parse(localStorage.getItem("slack_downloaded_files") || "[]") as string[]).includes(`${file.id}:${file.url}`);
      } catch { return false; }
    }
    return true;
  });
  const groups = visibleFiles.reduce<Record<string, SharedFile[]>>((result, file) => {
    const month = new Date(file.sentAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    (result[month] ??= []).push(file);
    return result;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[min(85vh,48rem)] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Files</DialogTitle>
          <DialogDescription>Files shared across your conversations, newest first.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1 border-b pb-3" role="tablist" aria-label="Filter files">
          {["All files", "Images", "Videos", "Documents", "Downloaded"].map((item) => (
            <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filter === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{item}</button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
          {loading ? <p className="text-muted-foreground py-8 text-center text-sm">Loading shared files…</p> : visibleFiles.length === 0 ? <p className="text-muted-foreground py-8 text-center text-sm">{filter === "All files" ? "No shared files found in this workspace." : `No ${filter.toLowerCase()} found in this workspace.`}</p> : Object.entries(groups).map(([month, items]) => (
            <section key={month} className="mb-6">
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">{month}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((file) => {
                  const url = file.url.startsWith("http") ? file.url : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}${file.url.startsWith("/") ? "" : "/"}${file.url}`;
                  return <div key={`${file.conversationId}-${file.id}`} className="border-border hover:bg-muted flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left">
                    <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${file.filename}`} className="flex min-w-0 flex-1 items-center gap-3">
                      {file.content_type.startsWith("image/") ? <Image src={url} alt="" width={40} height={40} unoptimized className="size-10 shrink-0 rounded-md object-cover" /> : <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md"><Icons.page className="size-5" /></span>}
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{file.filename}</span><span className="text-muted-foreground block truncate text-xs">{file.conversationName} · {new Date(file.sentAt).toLocaleDateString()}</span></span>
                    </a>
                    <AttachmentDownloadButton id={file.id} url={url} filename={file.filename} contentType={file.content_type} />
                  </div>;
                })}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
