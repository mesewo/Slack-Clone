"use client";

import { Icons } from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Conversation } from "../utils/types";
import { toast } from "sonner";
import { useState } from "react";

const statusDotColor = {
  online: "bg-green-500",
  offline: "bg-red-500",
} as const;

interface ChatHeaderProps {
  conversation: Conversation;
}

export function ChatHeader({ conversation }: ChatHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="border-border/60 bg-muted/30 relative flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3 sm:gap-4 sm:px-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative">
          <Avatar className="border-border/60 bg-background/80 text-foreground h-10 w-10 rounded-2xl border shadow-sm sm:h-12 sm:w-12 sm:rounded-3xl">
            <AvatarFallback className="bg-primary/15 text-primary rounded-2xl text-sm font-semibold sm:rounded-3xl sm:text-base">
              {conversation.initials}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "border-background absolute right-0 bottom-0 inline-flex h-3 w-3 rounded-full border-2 sm:h-3.5 sm:w-3.5",
              statusDotColor[conversation.status],
            )}
            aria-label={conversation.status === "online" ? "Online" : "Offline"}
          />
        </div>
        <div>
          <p className="text-foreground text-sm font-semibold tracking-tight sm:text-base">
            {conversation.name}
          </p>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {conversation.title}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="border-border/60 bg-background/70 text-muted-foreground hover:bg-accent/70 hover:text-foreground focus-visible:ring-primary/40 focus-visible:ring-offset-background size-8 rounded-full border shadow-sm transition focus-visible:ring-2 focus-visible:ring-offset-2 sm:size-10"
          aria-label="Start audio call"
          onClick={() => toast.info("Audio calls are coming soon")}
        >
          <Icons.phone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="border-border/60 bg-background/70 text-muted-foreground hover:bg-accent/70 hover:text-foreground focus-visible:ring-primary/40 focus-visible:ring-offset-background size-8 rounded-full border shadow-sm transition focus-visible:ring-2 focus-visible:ring-offset-2 sm:size-10"
          aria-label="Start video call"
          onClick={() => toast.info("Video calls are coming soon")}
        >
          <Icons.video className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="border-border/60 bg-background/70 text-muted-foreground hover:bg-accent/70 hover:text-foreground focus-visible:ring-primary/40 focus-visible:ring-offset-background size-8 rounded-full border shadow-sm transition focus-visible:ring-2 focus-visible:ring-offset-2 sm:size-10"
          aria-label="Open conversation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icons.ellipsis className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
        {menuOpen && (
          <div className="border-border bg-popover absolute top-14 right-3 z-30 w-52 rounded-xl border p-1 shadow-xl">
            {conversation.kind === "channel" ? (
              <>
                <button
                  type="button"
                  onClick={() => toast.info("Leave channel is coming soon")}
                  className="hover:bg-accent w-full rounded-lg px-3 py-2 text-left text-xs"
                >
                  Leave channel
                </button>
                <button
                  type="button"
                  onClick={() => toast.info("Channel details are coming soon")}
                  className="hover:bg-accent w-full rounded-lg px-3 py-2 text-left text-xs"
                >
                  Channel details
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => toast.info("Delete DM is coming soon")}
                  className="hover:bg-accent w-full rounded-lg px-3 py-2 text-left text-xs"
                >
                  Delete conversation
                </button>
                <button
                  type="button"
                  onClick={() =>
                    toast.info("Notifications settings are coming soon")
                  }
                  className="hover:bg-accent w-full rounded-lg px-3 py-2 text-left text-xs"
                >
                  Notification settings
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => toast.info("Pinned items are coming soon")}
              className="hover:bg-accent w-full rounded-lg px-3 py-2 text-left text-xs"
            >
              Pinned items
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="text-muted-foreground hover:bg-accent flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs"
            >
              <Icons.close className="size-3.5" /> Close
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
