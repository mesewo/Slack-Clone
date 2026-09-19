"use client";

import type { FC } from "react";
import { useState } from "react";
import Image from "next/image";
import { Icons } from "@/components/icons";
import { AttachmentDownloadButton } from "@/features/chat/components/AttachmentDownloadButton";
import { AttachmentLightbox } from "@/components/ui/attachment-lightbox";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

// 2 MB in bytes
const DEFAULT_AUTO_PREVIEW_SIZE_LIMIT = 2 * 1024 * 1024;

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
  mode = "message",
  maxAutoPreviewSize,
}) => {
  const isInverted = variant === "inverted";
  const isComposeMode = mode === "compose";
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [lightboxBlob, setLightboxBlob] = useState<Blob | null>(null);
  const [lightboxFilename, setLightboxFilename] = useState<string>("");
  const [lightboxContentType, setLightboxContentType] = useState<string>("");
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (files.length === 0) return null;

  // Helper to check if file should be auto-previewed
  const shouldAutoPreview = (file: UploadedFile): boolean => {
    // If maxAutoPreviewSize is set (used for message attachments)
    if (maxAutoPreviewSize !== undefined) {
      // Only auto-preview images that are under the size limit
      if (file.type.startsWith("image/")) {
        return (file.size ?? 0) <= maxAutoPreviewSize;
      }
      // Never auto-preview video (requires explicit click)
      if (file.type.startsWith("video/")) {
        return false;
      }
    }
    // Default behavior: auto-preview if URL exists
    return !!file.url;
  };

  // Helper to format file size
  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleImagePreview = (blob: Blob, file: UploadedFile) => {
    setLightboxBlob(blob);
    setLightboxFilename(file.name);
    setLightboxContentType(file.type);
    setLightboxOpen(true);
  };

  return (
    <div className={cn("flex w-full flex-col gap-2 rounded-xl p-2", className)}>
      <div className="flex w-full flex-wrap gap-2">
        {files.map((file) => {
          // COMPOSE MODE: Simple thumbnail + remove button only
          if (isComposeMode) {
            return (
              <div
                key={file.id}
                className={cn(
                  "group/file relative flex items-center rounded-xl transition-all",
                  isInverted
                    ? "bg-primary-foreground/15 hover:bg-primary-foreground/20"
                    : "bg-muted hover:bg-muted/80",
                  "max-w-[260px] min-w-[180px] p-2 pr-8",
                )}
              >
                {file.isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30">
                    <Icons.spinner
                      size={20}
                      className="animate-spin text-white"
                    />
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
                  <Image
                    src={file.url}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                    className="mr-3 size-10 rounded-lg object-cover"
                  />
                ) : (
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
                )}
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
              </div>
            );
          }

          // MESSAGE MODE: Full lightbox + gating + download logic
          const autoPreview = shouldAutoPreview(file);
          const isImage = file.type.startsWith("image/");
          const isVideo = file.type.startsWith("video/");
          const oversizeImage =
            maxAutoPreviewSize !== undefined &&
            isImage &&
            (file.size ?? 0) > maxAutoPreviewSize;

          return (
            <div
              key={file.id}
              className={cn(
                "group/file relative flex items-center rounded-xl transition-all",
                isInverted
                  ? "bg-primary-foreground/15 hover:bg-primary-foreground/20"
                  : "bg-muted hover:bg-muted/80",
                autoPreview && isImage
                  ? "max-w-[320px] p-1"
                  : "max-w-[260px] min-w-[180px] p-2 pr-8",
              )}
            >
              {file.isUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30">
                  <Icons.spinner
                    size={20}
                    className="animate-spin text-white"
                  />
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

              {/* Auto-preview: image (if size OK) or video (if no size gating) */}
              {autoPreview && isImage && file.url && !oversizeImage ? (
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
              ) : isVideo && file.url ? (
                <video
                  src={file.url}
                  controls
                  preload="metadata"
                  data-testid={`inline-video-${file.id}`}
                  className="max-h-72 max-w-[320px] rounded-md"
                >
                  <track kind="captions" />
                </video>
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
                      {oversizeImage ||
                      (maxAutoPreviewSize !== undefined && isVideo)
                        ? formatFileSize(file.size)
                        : getFormattedFileType(file.type, file.name)}
                    </span>
                  </div>
                </>
              )}

              {file.url && (
                <AttachmentDownloadButton
                  id={file.id}
                  url={file.url}
                  filename={file.name}
                  contentType={file.type}
                  className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                  onImagePreview={
                    (isImage || isVideo) && maxAutoPreviewSize !== undefined
                      ? (blob) => handleImagePreview(blob, file)
                      : undefined
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Dialog for upload preview (file-composer) */}
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
            <AttachmentDownloadButton
              id={previewFile.id}
              url={previewFile.url}
              filename={previewFile.name}
              contentType={previewFile.type}
              className="self-end"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox for message attachment images (opened after download) */}
      <AttachmentLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        blob={lightboxBlob!}
        filename={lightboxFilename}
        contentType={lightboxContentType}
      />
    </div>
  );
};
