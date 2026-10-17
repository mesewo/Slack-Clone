"use client";

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events, jsx-a11y/media-has-caption -- Viewer backdrop and click guards handle dismissal; stored media has no caption track. */

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  IconDownload,
  IconX,
  IconZoomIn,
  IconZoomOut,
  IconRotateClockwise,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";

export interface MediaItem {
  id: string;
  url: string;
  name: string;
  type: string;
  size?: number;
}

interface MediaGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  items: MediaItem[];
  initialIndex?: number;
}

export function MediaGallery({
  isOpen,
  onClose,
  items,
  initialIndex = 0,
}: MediaGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, items.length - 1)));
      setZoom(1);
      setRotation(0);
    }
  }, [isOpen, initialIndex, items.length]);

  const currentItem = items[currentIndex];

  const handleNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex((i) => i + 1);
      setZoom(1);
      setRotation(0);
    }
  }, [currentIndex, items.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setZoom(1);
      setRotation(0);
    }
  }, [currentIndex]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  const handleDownload = async () => {
    if (!currentItem?.url) return;
    try {
      const res = await fetch(currentItem.url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = currentItem.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(currentItem.url, "_blank");
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "+" || e.key === "=") handleZoomIn();
      if (e.key === "-") handleZoomOut();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, handleNext, handlePrev]);

  if (!isOpen || !currentItem) return null;

  const isImage = currentItem.type.startsWith("image/");
  const isVideo = currentItem.type.startsWith("video/");

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-zinc-700/95 backdrop-blur-md select-none animate-in fade-in-0 duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Media viewer: ${currentItem.name}`}
    >
      {/* Top Header Bar */}
      <div
        className="flex h-14 items-center justify-between border-b border-white/10 px-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <p className="truncate text-sm font-semibold">{currentItem.name}</p>
          {currentItem.size ? (
            <span className="text-xs text-white/60">
              {formatSize(currentItem.size)}
            </span>
          ) : null}
          {items.length > 1 && (
            <span className="text-xs text-white/50 bg-white/10 px-2 py-0.5 rounded-full">
              {currentIndex + 1} of {items.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isImage && (
            <>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                title="Zoom out (-)"
                className="rounded p-2 text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-30 transition"
              >
                <IconZoomOut className="size-4" />
              </button>
              <span className="w-12 text-center text-xs font-mono text-white/70">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                title="Zoom in (+)"
                className="rounded p-2 text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-30 transition"
              >
                <IconZoomIn className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleRotate}
                title="Rotate 90°"
                className="rounded p-2 text-white/80 hover:bg-white/15 hover:text-white transition"
              >
                <IconRotateClockwise className="size-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleDownload}
            title="Download file"
            className="rounded p-2 text-white/80 hover:bg-white/15 hover:text-white transition"
          >
            <IconDownload className="size-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Close viewer (Esc)"
            className="ml-2 rounded p-2 text-white/80 hover:bg-white/15 hover:text-white transition"
          >
            <IconX className="size-5" />
          </button>
        </div>
      </div>

      {/* Main Media Container */}
      <div
        className="relative flex flex-1 items-center justify-center p-4 overflow-hidden"
        onClick={onClose}
      >
        {/* Previous Button */}
        {items.length > 1 && currentIndex > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            title="Previous (Left arrow)"
            className="absolute left-4 z-20 flex size-10 items-center justify-center rounded-full bg-black/60 text-white/80 hover:bg-black/90 hover:text-white shadow-lg transition"
          >
            <IconChevronLeft className="size-6" />
          </button>
        )}

        {/* Media Content */}
        <div
          className="relative max-h-[85vh] max-w-[85vw] flex items-center justify-center rounded-lg border border-white/20 bg-zinc-950 p-1 transition-transform duration-150"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isImage ? (
            <Image
              src={currentItem.url}
              alt={currentItem.name}
              width={1600}
              height={1200}
              unoptimized
              className="max-h-[85vh] max-w-[85vw] w-auto h-auto object-contain rounded-md shadow-2xl"
            />
          ) : isVideo ? (
            <video
              src={currentItem.url}
              aria-label={`Video: ${currentItem.name}`}
              controls
              autoPlay
              className="max-h-[85vh] max-w-[85vw] w-auto h-auto rounded-md shadow-2xl bg-black"
            />
          ) : (
            <div className="p-8 bg-zinc-900 text-white rounded-xl text-center">
              <p className="text-base font-semibold">{currentItem.name}</p>
              <button
                type="button"
                onClick={handleDownload}
                className="mt-4 px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90"
              >
                Download to view
              </button>
            </div>
          )}
        </div>

        {/* Next Button */}
        {items.length > 1 && currentIndex < items.length - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            title="Next (Right arrow)"
            className="absolute right-4 z-20 flex size-10 items-center justify-center rounded-full bg-black/60 text-white/80 hover:bg-black/90 hover:text-white shadow-lg transition"
          >
            <IconChevronRight className="size-6" />
          </button>
        )}
      </div>
    </div>
  );
}

