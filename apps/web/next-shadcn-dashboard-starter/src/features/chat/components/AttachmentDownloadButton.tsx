"use client";

import { useState } from "react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";

export function AttachmentDownloadButton({
  id,
  url,
  filename,
  contentType,
  className = "",
  onImagePreview,
}: {
  id: string;
  url: string;
  filename: string;
  contentType?: string;
  className?: string;
  onImagePreview?: (blob: Blob) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"idle" | "downloading" | "complete">(
    "idle",
  );

  async function download() {
    if (state === "downloading") return;
    setState("downloading");
    setProgress(0);
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok || !response.body) throw new Error("Download failed");
      const total = Number(response.headers.get("content-length")) || 0;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        received += value.byteLength;
        if (total > 0) setProgress(Math.round((received / total) * 100));
      }
      const blob = new Blob(chunks as BlobPart[], { type: contentType });

      // Media opens in the in-app viewer after the streamed download completes.
      if (
        (contentType?.startsWith("image/") ||
          contentType?.startsWith("video/")) &&
        onImagePreview
      ) {
        onImagePreview(blob);
        setProgress(100);
        setState("complete");
        window.setTimeout(() => setState("idle"), 1400);
        return;
      }

      // Non-media files retain the direct download behavior.
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setProgress(100);
      setState("complete");
      window.setTimeout(() => setState("idle"), 1400);
    } catch {
      setState("idle");
      setProgress(0);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={state === "downloading"}
      className={`relative inline-flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur hover:bg-background disabled:cursor-wait ${className}`}
      aria-label={
        state === "downloading"
          ? `Downloading ${filename}`
          : `Download ${filename}`
      }
      title={`Download ${filename}`}
    >
      {state === "complete" ? (
        <IconCheck className="size-4 text-emerald-600" />
      ) : state === "downloading" ? (
        <svg
          viewBox="0 0 36 36"
          className="size-6 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 15}
            strokeDashoffset={2 * Math.PI * 15 * (1 - progress / 100)}
          />
        </svg>
      ) : (
        <IconChevronDown className="size-5" />
      )}
      {state === "downloading" && <span className="sr-only">{progress}%</span>}
    </button>
  );
}
