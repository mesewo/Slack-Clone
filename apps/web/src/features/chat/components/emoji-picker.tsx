"use client";

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- The dialog stops bubbling so its parent popover remains open. */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ALL_EMOJIS,
  EMOJI_CATEGORIES,
  CATEGORY_ICONS,
  type EmojiItem,
  type EmojiCategory,
} from "../utils/emoji-data";
import {
  getFrequentlyUsedEmojis,
  searchEmojis,
  trackEmojiUsage,
} from "../utils/emoji-frequency";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  className?: string;
  autoFocus?: boolean;
}

export function EmojiPicker({
  onSelect,
  onClose,
  className,
  autoFocus = true,
}: EmojiPickerProps) {
  const [search, setSearch] = useState("");
  const [hoveredEmoji, setHoveredEmoji] = useState<EmojiItem | null>(null);
  const [frequentEmojis, setFrequentEmojis] = useState<EmojiItem[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load frequent emojis on mount and listen to updates
  useEffect(() => {
    setFrequentEmojis(getFrequentlyUsedEmojis(24));

    const handleUpdate = () => {
      setFrequentEmojis(getFrequentlyUsedEmojis(24));
    };

    window.addEventListener("emoji_frequency_updated", handleUpdate);
    return () => {
      window.removeEventListener("emoji_frequency_updated", handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (autoFocus && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [autoFocus]);

  // Group emojis by category
  const emojisByCategory = useMemo(() => {
    const map = new Map<string, EmojiItem[]>();
    for (const cat of EMOJI_CATEGORIES) {
      if (cat !== "Frequently Used") {
        map.set(cat, []);
      }
    }
    for (const item of ALL_EMOJIS) {
      const list = map.get(item.category);
      if (list) {
        list.push(item);
      }
    }
    return map;
  }, []);

  // Search results ranked by frequency
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    return searchEmojis(search, 80);
  }, [search]);

  const handleSelectEmoji = (emojiItem: EmojiItem) => {
    trackEmojiUsage(emojiItem.emoji);
    onSelect(emojiItem.emoji);
  };

  const scrollToCategory = (category: EmojiCategory) => {
    if (search) {
      setSearch("");
    }
    setTimeout(() => {
      if (!scrollContainerRef.current) return;
      const element = scrollContainerRef.current.querySelector(
        `[data-category="${category}"]`
      );
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 10);
  };

  return (
    <div
      className={cn(
        "flex w-80 flex-col rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl",
        className
      )}
      role="dialog"
      aria-label="Emoji picker"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search Bar */}
      <div className="relative border-b border-border/70 p-2">
        <div className="relative flex items-center">
          <Icons.search className="text-muted-foreground absolute left-2.5 size-3.5" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emojis..."
            aria-label="Search emojis"
            className="w-full rounded-md border border-input bg-background py-1.5 pr-8 pl-8 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground absolute right-2.5 p-0.5"
              aria-label="Clear search"
            >
              <Icons.close className="size-3" />
            </button>
          ) : onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground absolute right-2.5 p-0.5"
              aria-label="Close emoji picker"
            >
              <Icons.close className="size-3" />
            </button>
          ) : null}
        </div>

        {/* Category Icons Nav */}
        {!search && (
          <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-1.5">
            {EMOJI_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => scrollToCategory(cat)}
                title={cat}
                aria-label={`Jump to ${cat}`}
                className="hover:bg-accent flex size-6 items-center justify-center rounded text-sm transition hover:scale-110"
              >
                {CATEGORY_ICONS[cat]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Emoji Scroll Area */}
      <div
        ref={scrollContainerRef}
        className="h-64 overflow-y-auto px-2 py-1.5 scroll-smooth"
      >
        {searchResults !== null ? (
          <div>
            <div className="text-muted-foreground sticky top-0 z-10 bg-popover/95 py-1 text-[0.68rem] font-semibold tracking-wider uppercase backdrop-blur-xs">
              Search Results ({searchResults.length})
            </div>
            {searchResults.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center text-xs">
                No emojis found for &ldquo;{search}&rdquo;
              </div>
            ) : (
              <div className="grid grid-cols-8 gap-0.5">
                {searchResults.map((item) => (
                  <button
                    key={`${item.emoji}-${item.name}`}
                    type="button"
                    onClick={() => handleSelectEmoji(item)}
                    onMouseEnter={() => setHoveredEmoji(item)}
                    onFocus={() => setHoveredEmoji(item)}
                    title={`:${item.name}:`}
                    className="hover:bg-accent flex size-8 items-center justify-center rounded text-xl transition-transform hover:scale-125 focus:scale-125 focus:outline-none"
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Frequently Used */}
            {frequentEmojis.length > 0 && (
              <div data-category="Frequently Used" className="mb-2">
                <div className="text-muted-foreground sticky top-0 z-10 bg-popover/95 py-1 text-[0.68rem] font-semibold tracking-wider uppercase backdrop-blur-xs">
                  Frequently Used
                </div>
                <div className="grid grid-cols-8 gap-0.5">
                  {frequentEmojis.map((item) => (
                    <button
                      key={`freq-${item.emoji}-${item.name}`}
                      type="button"
                      onClick={() => handleSelectEmoji(item)}
                      onMouseEnter={() => setHoveredEmoji(item)}
                      onFocus={() => setHoveredEmoji(item)}
                      title={`:${item.name}:`}
                      className="hover:bg-accent flex size-8 items-center justify-center rounded text-xl transition-transform hover:scale-125 focus:scale-125 focus:outline-none"
                    >
                      {item.emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Category Groups */}
            {EMOJI_CATEGORIES.filter((cat) => cat !== "Frequently Used").map(
              (cat) => {
                const items = emojisByCategory.get(cat) || [];
                return (
                  <div key={cat} data-category={cat} className="mb-2">
                    <div className="text-muted-foreground sticky top-0 z-10 bg-popover/95 py-1 text-[0.68rem] font-semibold tracking-wider uppercase backdrop-blur-xs">
                      {cat}
                    </div>
                    <div className="grid grid-cols-8 gap-0.5">
                      {items.map((item) => (
                        <button
                          key={`${item.emoji}-${item.name}`}
                          type="button"
                          onClick={() => handleSelectEmoji(item)}
                          onMouseEnter={() => setHoveredEmoji(item)}
                          onFocus={() => setHoveredEmoji(item)}
                          title={`:${item.name}:`}
                          className="hover:bg-accent flex size-8 items-center justify-center rounded text-xl transition-transform hover:scale-125 focus:scale-125 focus:outline-none"
                        >
                          {item.emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>

      {/* Hover Preview Footer (Slack-style) */}
      <div className="flex h-12 items-center gap-2.5 border-t border-border/70 bg-muted/30 px-3 py-1">
        {hoveredEmoji ? (
          <>
            <span className="text-2xl select-none">{hoveredEmoji.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                :{hoveredEmoji.name}:
              </p>
              <p className="text-muted-foreground truncate text-[0.65rem]">
                {hoveredEmoji.keywords.slice(0, 3).join(", ")}
              </p>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-lg">💬</span>
            <span className="text-[0.72rem] select-none">
              Hover over an emoji to preview
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
