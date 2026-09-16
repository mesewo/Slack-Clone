"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { IconDownload, IconX } from "@tabler/icons-react";

interface AttachmentLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  blob: Blob;
  filename: string;
  contentType: string;
}

export function AttachmentLightbox({
  isOpen,
  onClose,
  blob,
  filename,
  contentType,
}: AttachmentLightboxProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && blob) {
      const url = URL.createObjectURL(blob);
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [isOpen, blob]);

  if (!isOpen || !objectUrl) return null;

  const isImage = contentType.startsWith("image/");
  const isVideo = contentType.startsWith("video/");

  async function saveFile() {
    if (!objectUrl) return;
    const savePicker = (
      window as Window & {
        showSaveFilePicker?: (options?: unknown) => Promise<{
          createWritable: () => Promise<{
            write: (data: Blob) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }>;
      }
    ).showSaveFilePicker;

    if (savePicker) {
      const handle = await savePicker({
        suggestedName: filename,
        types: [
          {
            description: contentType,
            accept: { [contentType]: ["." + filename.split(".").pop()] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${filename}`}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw] rounded-lg bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 z-10 rounded-full p-1 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          aria-label="Close preview"
        >
          <IconX className="size-6 text-white" />
        </button>

        <div className="flex flex-col gap-2 p-2">
          {isImage && (
            <Image
              src={objectUrl}
              alt={filename}
              width={1200}
              height={900}
              unoptimized
              className="max-h-[85vh] w-auto rounded-lg object-contain"
            />
          )}
          {isVideo && (
            <video
              src={objectUrl}
              controls
              autoPlay
              className="max-h-[85vh] max-w-[85vw] rounded-lg"
            >
              <track kind="captions" />
            </video>
          )}
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-muted-foreground">{filename}</span>
            <button
              type="button"
              onClick={() => void saveFile()}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground hover:bg-muted"
              aria-label={`Save ${filename}`}
            >
              <IconDownload className="size-3.5" />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
