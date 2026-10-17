"use client";

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events, jsx-a11y/media-has-caption -- Preview backdrops and click guards preserve viewer interaction; source files do not include captions. */

import React, { FC, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Icons } from "@/components/icons";
import { AttachmentDownloadButton } from "@/features/chat/components/AttachmentDownloadButton";
import { MediaGallery, type MediaItem } from "@/components/ui/media-gallery";
import { cn } from "@/lib/utils";

export interface UploadedFile {
  id: string;
  url?: string;
  name: string;
  type: string;
  description?: string;
  isUploading?: boolean;
  size?: number;
}

export interface FilePreviewProps {
  files: UploadedFile[];
  onRemove?: (id: string) => void;
  className?: string;
  variant?: "default" | "inverted";
  mode?: "compose" | "message";
  maxAutoPreviewSize?: number;
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
      "go",
      "rs",
      "c",
      "cpp",
      "html",
      "css",
      "json",
    ].includes(extension)
  )
    return (
      <Icons.code {...iconProps} className="text-amber-500 dark:text-amber-400" />
    );

  if (
    ["zip", "tar", "gz", "rar", "7z"].includes(extension) ||
    fileType.includes("zip") ||
    fileType.includes("compressed")
  )
    return (
      <Icons.fileZip
        {...iconProps}
        className="text-amber-600 dark:text-amber-500"
      />
    );

  if (fileType.startsWith("video/"))
    return (
      <Icons.video
        {...iconProps}
        className="text-purple-500 dark:text-purple-400"
      />
    );

  if (fileType.startsWith("audio/"))
    return (
      <Icons.music
        {...iconProps}
        className="text-pink-500 dark:text-pink-400"
      />
    );

  return (
    <Icons.page {...iconProps} className="text-zinc-400 dark:text-zinc-500" />
  );
};

const getFormattedFileType = (fileType: string, fileName: string): string => {
  const ext = getFileExtension(fileName).toUpperCase();
  const typePart = fileType.split("/")[1]?.toUpperCase();

  if (!typePart || typePart === "OCTET-STREAM") {
    return ext || "FILE";
  }

  const cleanType = typePart
    .replace("VND.OPENXMLFORMATS-OFFICEDOCUMENT.", "")
    .replace("VND.MS-", "")
    .replace("X-", "")
    .replace("DOCUMENT.", "")
    .replace("PRESENTATION.", "")
    .replace("APPLICATION.", "")
    .split(".")[0];

  return cleanType.substring(0, 8);
};

export const FilePreview: FC<FilePreviewProps> = ({
  files,
  onRemove,
  className,
  variant = "default",
  mode = "message",
}) => {
  const isInverted = variant === "inverted";
  const isComposeMode = mode === "compose";
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [imagePreview, setImagePreview] = useState<MediaItem | null>(null);

  useEffect(() => {
    if (!imagePreview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imagePreview]);

  if (files.length === 0) return null;

  const mediaFiles: MediaItem[] = files
    .filter(
      (f) =>
        f.url &&
        (f.type.startsWith("image/") || f.type.startsWith("video/"))
    )
    .map((f) => ({
      id: f.id,
      url: f.url!,
      name: f.name,
      type: f.type,
      size: f.size,
    }));

  const openGalleryForFile = (fileId: string) => {
    const idx = mediaFiles.findIndex((m) => m.id === fileId);
    if (idx !== -1) {
      setGalleryIndex(idx);
      setGalleryOpen(true);
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 1. COMPOSE MODE: Compact preview chips with upload spinner, click preview, and remove button
  if (isComposeMode) {
    return (
      <>
        <div className={cn("flex w-full flex-wrap gap-2 p-1.5", className)}>
          {files.map((file) => (
            <div
              key={file.id}
              className={cn(
                "group/file relative flex items-center rounded-xl transition-all",
                isInverted
                  ? "bg-primary-foreground/15 hover:bg-primary-foreground/20"
                  : "bg-muted/90 hover:bg-muted border border-border/60",
                "max-w-[260px] min-w-[170px] p-2 pr-7 select-none"
              )}
            >
              {/* Uploading Animation Overlay */}
              {file.isUploading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-black/55 backdrop-blur-[1px] text-white">
                  <Icons.spinner size={18} className="animate-spin text-white mb-0.5" />
                  <span className="text-[0.62rem] font-medium tracking-wide">Uploading...</span>
                </div>
              )}

              {onRemove && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(file.id);
                  }}
                  className="absolute top-1.5 right-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-muted-foreground/60 hover:bg-muted-foreground text-white cursor-pointer transition"
                  aria-label={`Remove ${file.name}`}
                >
                  <Icons.close size={11} />
                </button>
              )}

              {file.type.startsWith("image/") && file.url ? (
                <button type="button" className="group/thumb relative mr-2.5 shrink-0 cursor-pointer overflow-hidden rounded-lg" onClick={() => setImagePreview({ id: file.id, url: file.url!, name: file.name, type: file.type, size: file.size })} title="Preview image" aria-label={`Preview ${file.name}`}>
                  <Image
                    src={file.url}
                    alt={file.name}
                    width={48}
                    height={48}
                    unoptimized
                    className="size-12 rounded-lg object-cover transition-transform group-hover/thumb:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/35 opacity-0 transition-opacity group-hover/thumb:opacity-100">
                    <Icons.media size={14} className="text-white" />
                  </div>
                </button>
              ) : file.type.startsWith("video/") && file.url ? (
                <div className="relative mr-2.5 size-12 shrink-0 overflow-hidden rounded-lg bg-black" title={file.name}>
                  <video src={file.url} aria-label={`Video thumbnail: ${file.name}`} muted preload="metadata" className="size-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                    <Icons.video size={18} />
                  </span>
                </div>
              ) : (
                <div
                  className={cn(
                    "mr-2.5 flex size-10 items-center justify-center rounded-lg",
                    isInverted
                      ? "bg-primary-foreground/10"
                      : "bg-muted-foreground/10"
                  )}
                >
                  {getFileIcon(file.type, file.name)}
                </div>
              )}

              <div className="flex min-w-0 flex-1 flex-col">
                <p
                  className={cn(
                    "truncate text-xs font-semibold",
                    isInverted ? "text-primary-foreground" : "text-foreground"
                  )}
                  title={file.name}
                >
                  {file.name}
                </p>
                <span
                  className={cn(
                    "text-[0.68rem]",
                    isInverted
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  )}
                >
                  {formatFileSize(file.size) || getFormattedFileType(file.type, file.name)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {imagePreview && typeof document !== "undefined" && createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Image preview: ${imagePreview.name}`}
            onClick={() => setImagePreview(null)}
            className="fixed inset-0 grid place-items-center bg-black/65 p-5 backdrop-blur-sm sm:p-8"
            style={{ zIndex: 2147483647, visibility: "visible" }}
          >
            <button
              type="button"
              className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full border border-white/25 bg-black/65 text-white shadow-lg transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              onClick={() => setImagePreview(null)}
              aria-label="Close image preview"
            >
              <Icons.close className="size-5" />
            </button>
            <div
              className="flex max-h-[88vh] max-w-[92vw] items-center justify-center rounded-xl border border-white/30 bg-black/35 p-1.5 shadow-[0_24px_90px_rgba(0,0,0,0.6)] sm:p-2"
              onClick={(event) => event.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview.url}
                alt={imagePreview.name}
                className="max-h-[86vh] max-w-[90vw] rounded-lg object-contain"
              />
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  // 2. MESSAGE MODE: Natural image/video rendering (Slack style) & Slack file cards
  return (
    <>
      <div className={cn("flex w-full flex-wrap items-start gap-2.5 my-1.5", className)}>
        {files.map((file) => {
          const isImage = file.type.startsWith("image/");
          const isVideo = file.type.startsWith("video/");

          // Images: rendered naturally with rounded corners and centered hover download button
          if (isImage && file.url) {
            return (
              <div
                key={file.id}
                className="group/media relative inline-block overflow-hidden rounded-lg border border-border/40 hover:border-border/80 transition-all shadow-xs"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <button
                  type="button"
                  aria-label={`Open ${file.name} in media gallery`}
                  onClick={() => openGalleryForFile(file.id)}
                  title="Click to view full image"
                  className="block cursor-pointer border-0 bg-transparent p-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.url}
                    alt={file.name}
                    className="max-h-80 max-w-[420px] w-auto h-auto rounded-lg object-contain transition-transform duration-200 hover:scale-[1.01]"
                  />
                </button>
                {/* Keep the download control visible; add the dimmed hover treatment on hover. */}
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition-colors group-hover/media:bg-black/35 pointer-events-none">
                  <div className="pointer-events-auto">
                    <AttachmentDownloadButton
                      id={file.id}
                      url={file.url}
                      filename={file.name}
                      contentType={file.type}
                    />
                  </div>
                </div>
              </div>
            );
          }

          // Videos: rendered cleanly with centered hover download overlay
          if (isVideo && file.url) {
            return (
              <div
                key={file.id}
                className="group/media relative inline-block overflow-hidden rounded-lg border border-border/40 bg-black shadow-xs"
              >
                  <video
                    src={file.url}
                    aria-label={`Video: ${file.name}`}
                  controls
                  preload="metadata"
                  className="max-h-80 max-w-[440px] w-auto h-auto rounded-lg"
                />
                {/* Keep the download control visible; add the dimmed hover treatment on hover. */}
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition-colors group-hover/media:bg-black/35 pointer-events-none">
                  <div className="pointer-events-auto">
                    <AttachmentDownloadButton
                      id={file.id}
                      url={file.url}
                      filename={file.name}
                      contentType={file.type}
                    />
                  </div>
                </div>
              </div>
            );
          }

          // Other files (PDFs, docs, spreadsheets, zip, audio, code): Slack file card
          // Download icon sits on the foreground directly above the left file thumbnail
          return (
            <div
              key={file.id}
              className={cn(
                "group/file relative flex items-center gap-3 rounded-lg border border-border/80 bg-background/80 hover:bg-accent/40 p-2.5 transition-colors max-w-sm min-w-[200px]",
                isInverted && "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground"
              )}
            >
              {/* Left thumbnail with a persistent download icon until the file is downloaded. */}
              <div className="relative flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/80 overflow-hidden">
                {getFileIcon(file.type, file.name)}
                {file.url && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-transparent transition-colors group-hover/file:bg-black/55">
                    <AttachmentDownloadButton
                      id={file.id}
                      url={file.url}
                      filename={file.name}
                      contentType={file.type}
                    />
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <p
                  className="truncate text-xs font-semibold text-foreground"
                  title={file.name}
                >
                  {file.name}
                </p>
                <span className="text-[0.68rem] text-muted-foreground">
                  {formatFileSize(file.size) || getFormattedFileType(file.type, file.name)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Slack Media Gallery / Viewer */}
      {mediaFiles.length > 0 && (
        <MediaGallery
          isOpen={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          items={mediaFiles}
          initialIndex={galleryIndex}
        />
      )}
    </>
  );
};
