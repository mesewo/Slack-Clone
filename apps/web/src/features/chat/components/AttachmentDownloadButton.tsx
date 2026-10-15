"use client";

import { useEffect, useState } from "react";
import { IconArrowDown } from "@tabler/icons-react";

export function AttachmentDownloadButton({
  id,
  url,
  filename,
  contentType,
  className = "",
  overlay = false,
  onImagePreview,
}: {
  id: string;
  url: string;
  filename: string;
  contentType?: string;
  className?: string;
  overlay?: boolean;
  onImagePreview?: (blob: Blob) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"idle" | "downloading" | "complete">(
    "idle",
  );

  useEffect(() => {
    try {
      const downloaded = JSON.parse(localStorage.getItem("slack_downloaded_files") || "[]") as string[];
      if (downloaded.includes(`${id}:${url}`)) setState("complete");
    } catch {
      // Keep the download available when browser storage is disabled.
    }
  }, [id, url]);

  async function download() {
    if (state === "downloading") return;
    setState("downloading");
    setProgress(0);
    reportProgress("downloading", 0);
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
        if (total > 0) {
          const nextProgress = Math.round((received / total) * 100);
          setProgress(nextProgress);
          reportProgress("downloading", nextProgress);
        }
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
        reportProgress("complete", 100);
        rememberDownload();
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
      reportProgress("complete", 100);
      rememberDownload();
    } catch {
      setState("idle");
      setProgress(0);
      reportProgress("failed", 0);
    }
  }

  function reportProgress(status: "downloading" | "complete" | "failed", value: number) {
    window.dispatchEvent(new CustomEvent("workspace:download-progress", {
      detail: { id, filename, status, progress: value },
    }));
  }

  function rememberDownload() {
    try {
      const downloaded = JSON.parse(localStorage.getItem("slack_downloaded_files") || "[]") as string[];
      localStorage.setItem("slack_downloaded_files", JSON.stringify([...new Set([...downloaded, `${id}:${url}`])]));
    } catch {
      // The completed state still stays visible for this mounted attachment.
    }
  }

  if (state === "complete") return null;

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={state === "downloading"}
      className={`${overlay ? "absolute inset-0 z-10 flex h-full w-full rounded-xl bg-black/25 text-white hover:bg-black/40" : "relative inline-flex size-8 rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur hover:bg-background"} items-center justify-center transition-colors disabled:cursor-wait ${className}`}
      aria-label={
        state === "downloading"
          ? `Downloading ${filename}`
          : `Download ${filename}`
      }
      title={`Download ${filename}`}
    >
      {state === "downloading" ? (
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
            stroke={overlay ? "white" : "currentColor"}
            strokeOpacity="0.2"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke={overlay ? "white" : "currentColor"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 15}
            strokeDashoffset={2 * Math.PI * 15 * (1 - progress / 100)}
          />
        </svg>
      ) : (
        <span className={`flex size-10 items-center justify-center rounded-full shadow-lg ring-1 ${overlay ? "bg-black/55 ring-white/70" : "bg-muted ring-border"}`}>
          <IconArrowDown className="size-6" />
        </span>
      )}
      {state === "downloading" && <span className="sr-only">{progress}%</span>}
    </button>
  );
}
