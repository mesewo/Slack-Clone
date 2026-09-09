"use client";

import type { FC } from "react";
import { useState } from "react";
import Image from "next/image";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export interface UploadedFile {
  id: string;
  url?: string;
  name: string;
  type: string;
  description?: string;
  isUploading?: boolean;
}

export interface FilePreviewProps {
  files: UploadedFile[];
  onRemove?: (id: string) => void;
  className?: string;
  variant?: "default" | "inverted";
}

const getFileExtension = (fileName: string): string => {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const getFileIcon = (fileType: string, fileName: string) => {
  const extension = getFileExtension(fileName).toLowerCase();
  const iconProps = { size: 24 };

  if (fileType.startsWith("image/"))
    return (
      <Icons.media
        {...iconProps}
        className="text-emerald-500 dark:text-emerald-400"
      />
    );

  if (fileType === "application/pdf" || extension === "pdf")
    return (
      <Icons.fileTypePdf
        {...iconProps}
        className="text-red-500 dark:text-red-400"
      />
    );

  if (
    ["doc", "docx", "odt", "rtf"].includes(extension) ||
    fileType.includes("wordprocessing") ||
    fileType.includes("msword")
  )
    return (
      <Icons.fileTypeDoc
        {...iconProps}
        className="text-blue-500 dark:text-blue-400"
      />
    );

  if (
    ["xls", "xlsx", "csv", "ods"].includes(extension) ||
    fileType.includes("spreadsheet") ||
    fileType.includes("excel")
  )
    return (
      <Icons.fileTypeXls
        {...iconProps}
        className="text-green-500 dark:text-green-400"
      />
    );

  if (["txt", "md"].includes(extension) || fileType === "text/plain")
    return (
      <Icons.post {...iconProps} className="text-zinc-500 dark:text-zinc-400" />
    );

  if (
    [
      "js",
      "ts",
      "jsx",
      "tsx",
      "py",
      "java",
      "c",
      "cpp",
      "html",
      "css",
    ].includes(extension) ||
    fileType.includes("javascript") ||
    fileType.includes("typescript")
  )
    return (
      <Icons.code
        {...iconProps}
        className="text-yellow-500 dark:text-yellow-400"
      />
    );

  if (["json", "xml", "yaml", "yml"].includes(extension))
    return (
      <Icons.code {...iconProps} className="text-zinc-500 dark:text-zinc-400" />
    );

  if (
    fileType.startsWith("video/") ||
    ["mp4", "avi", "mov", "mkv"].includes(extension)
  )
    return (
      <Icons.video
        {...iconProps}
        className="text-purple-500 dark:text-purple-400"
      />
    );

  if (
    fileType.startsWith("audio/") ||
    ["mp3", "wav", "ogg"].includes(extension)
  )
    return (
      <Icons.music
        {...iconProps}
        className="text-pink-500 dark:text-pink-400"
      />
    );

  if (
    ["zip", "rar", "tar", "gz", "7z"].includes(extension) ||
    fileType.includes("archive") ||
    fileType.includes("compressed")
  )
    return (
      <Icons.fileZip
        {...iconProps}
        className="text-amber-500 dark:text-amber-400"
      />
    );

  return (
    <Icons.page {...iconProps} className="text-zinc-500 dark:text-zinc-400" />
  );
};

const getFormattedFileType = (fileType: string, fileName: string): string => {
  const ext = getFileExtension(fileName).toUpperCase();

  if (fileType.includes("msword") || fileType.includes("wordprocessing"))
    return "DOC";

  if (fileType.includes("spreadsheet") || fileType.includes("excel"))
    return "SPREADSHEET";

  const typePart = fileType.split("/")[1];

  if (!typePart || typePart === "octet-stream") {
    return ext || "FILE";
  }

  const cleanType = typePart
    .replace("vnd.openxmlformats-officedocument.", "")
    .replace("vnd.ms-", "")
    .replace("x-", "")
    .replace("document.", "")
    .replace("presentation.", "")
    .replace("application.", "")
    .split(".")[0];

  return cleanType.toUpperCase().substring(0, 8);
};

export const FilePreview: FC<FilePreviewProps> = ({
  files,
  onRemove,
  className,
  variant = "default",
}) => {
  const isInverted = variant === "inverted";
  const [downloads, setDownloads] = useState<Record<string, number>>({});
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  if (files.length === 0) return null;

  const downloadFile = async (file: UploadedFile) => {
    if (!file.url || downloading[file.id]) return;
    setDownloading((current) => ({ ...current, [file.id]: true }));
    setDownloads((current) => ({ ...current, [file.id]: 0 }));
    try {
      const response = await fetch(file.url, { credentials: "include" });
      if (!response.ok || !response.body) throw new Error("Download failed");
      const total = Number(response.headers.get("content-length")) || 0;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          if (total > 0) {
            setDownloads((current) => ({
              ...current,
              [file.id]: Math.round((received / total) * 100),
            }));
          }
        }
      }
      const objectUrl = URL.createObjectURL(
        new Blob(chunks as BlobPart[], { type: file.type }),
      );
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setDownloads((current) => ({ ...current, [file.id]: 100 }));
    } finally {
      setDownloading((current) => ({ ...current, [file.id]: false }));
    }
  };

  return (
    <div className={cn("flex w-full flex-col gap-2 rounded-xl p-2", className)}>
      <div className="flex w-full flex-wrap gap-2">
        {files.map((file) => (
          <div
            key={file.id}
            className={cn(
              "group/file relative flex items-center rounded-xl transition-all",
              isInverted
                ? "bg-primary-foreground/15 hover:bg-primary-foreground/20"
                : "bg-muted hover:bg-muted/80",
              file.type.startsWith("image/") && file.url
                ? "max-w-[320px] p-1"
                : "max-w-[260px] min-w-[180px] p-2 pr-8",
            )}
          >
            {file.isUploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30">
                <Icons.spinner size={20} className="animate-spin text-white" />
              </div>
            )}

            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                className={cn(
                  "absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full",
                  "scale-75 opacity-0 transition-all duration-150 group-hover/file:scale-100 group-hover/file:opacity-100",
                  "bg-muted-foreground/60 hover:bg-muted-foreground/80 cursor-pointer",
                )}
                aria-label={`Remove ${file.name}`}
              >
                <Icons.close size={10} className="text-white" />
              </button>
            )}

            {file.type.startsWith("image/") && file.url ? (
              <button
                type="button"
                className="max-h-72 max-w-[300px] cursor-zoom-in overflow-hidden rounded-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                onClick={() => setPreviewFile(file)}
                aria-label={`Preview ${file.name}`}
              >
                <Image
                  src={file.url}
                  alt={file.name}
                  width={300}
                  height={288}
                  unoptimized
                  className="h-auto max-h-72 max-w-full object-contain"
                />
              </button>
            ) : file.type.startsWith("video/") && file.url ? (
              <button
                type="button"
                className="cursor-zoom-in rounded-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                onClick={() => setPreviewFile(file)}
                aria-label={`Preview ${file.name}`}
              >
                <video
                  src={file.url}
                  preload="metadata"
                  className="pointer-events-none max-h-72 max-w-[300px] rounded-md"
                >
                  <track kind="captions" />
                </video>
              </button>
            ) : (
              <>
                <div
                  className={cn(
                    "mr-3 flex h-10 w-10 items-center justify-center rounded-lg",
                    isInverted
                      ? "bg-primary-foreground/10"
                      : "bg-muted-foreground/10",
                  )}
                >
                  {getFileIcon(file.type, file.name)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      isInverted
                        ? "text-primary-foreground"
                        : "text-foreground",
                    )}
                  >
                    {file.name.length > 18
                      ? `${file.name.substring(0, 15)}...`
                      : file.name}
                  </p>
                  <span
                    className={cn(
                      "text-xs",
                      isInverted
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground",
                    )}
                  >
                    {getFormattedFileType(file.type, file.name)}
                  </span>
                </div>
              </>
            )}
            {file.url && (
              <button
                type="button"
                onClick={() => void downloadFile(file)}
                disabled={downloading[file.id]}
                className="text-primary absolute right-2 bottom-1 text-[0.65rem] font-medium hover:underline"
              >
                {downloading[file.id]
                  ? `Downloading ${downloads[file.id] || 0}%`
                  : downloads[file.id] === 100
                    ? "Downloaded"
                    : "Download"}
              </button>
            )}
            {file.url && downloads[file.id] !== 100 && (
              <button
                type="button"
                onClick={() => void downloadFile(file)}
                disabled={downloading[file.id]}
                className="bg-background/70 text-foreground hover:bg-background/90 absolute top-1/2 left-1/2 z-10 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-sm backdrop-blur"
                aria-label={
                  downloading[file.id]
                    ? `Downloading ${file.name}`
                    : `Download ${file.name}`
                }
              >
                {downloading[file.id] ? (
                  <Icons.spinner size={16} className="animate-spin" />
                ) : (
                  <Icons.chevronDown size={18} />
                )}
              </button>
            )}
            {downloading[file.id] && (
              <div className="absolute right-2 bottom-0 left-2 h-0.5 overflow-hidden rounded-full bg-primary/20">
                <div
                  className="bg-primary h-full transition-[width] duration-150"
                  style={{ width: `${downloads[file.id] || 12}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <Dialog
        open={Boolean(previewFile)}
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null);
        }}
      >
        <DialogContent className="max-w-4xl border-border/70 bg-background/95 p-3 sm:p-4">
          <DialogTitle className="truncate pr-8 text-sm">
            {previewFile?.name || "Attachment preview"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Preview of the selected attachment
          </DialogDescription>
          {previewFile?.type.startsWith("image/") && previewFile.url ? (
            <Image
              src={previewFile.url}
              alt={previewFile.name}
              width={1200}
              height={900}
              unoptimized
              className="max-h-[75vh] w-full rounded-lg object-contain"
            />
          ) : previewFile?.type.startsWith("video/") && previewFile.url ? (
            <video
              src={previewFile.url}
              controls
              autoPlay
              className="max-h-[75vh] w-full rounded-lg"
            >
              <track kind="captions" />
            </video>
          ) : null}
          {previewFile?.url && (
            <button
              type="button"
              onClick={() => void downloadFile(previewFile)}
              className="text-primary self-end text-xs font-medium hover:underline"
            >
              Download attachment
            </button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
