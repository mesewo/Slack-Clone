"use client";

import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconClock, IconMessage, IconCopy, IconCheck } from "@tabler/icons-react";
import { toast } from "sonner";

interface UserProfilePopoverProps {
  userId?: string | null;
  author: string;
  isCurrentUser?: boolean;
  onStartDM?: (userId: string) => void;
  children: React.ReactNode;
}

export function UserProfilePopover({
  userId,
  author,
  isCurrentUser = false,
  onStartDM,
  children,
}: UserProfilePopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const localTime = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleCopyName = () => {
    navigator.clipboard.writeText(author);
    setCopied(true);
    toast.success(`Copied "${author}"`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartMessage = () => {
    setOpen(false);
    if (userId && onStartDM) {
      onStartDM(userId);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<span className="inline-flex cursor-pointer" />}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        className="w-72 p-0 overflow-hidden rounded-2xl border border-border/80 bg-popover shadow-2xl text-popover-foreground animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner */}
        <div className="h-16 w-full bg-gradient-to-r from-purple-700 via-indigo-600 to-primary/80 relative" />

        {/* Content */}
        <div className="px-4 pb-4 pt-0 relative">
          {/* Avatar floating over banner */}
          <div className="relative -mt-8 mb-2.5 inline-block">
            <Avatar className="size-16 rounded-2xl border-4 border-background shadow-md">
              <AvatarFallback className="bg-primary/20 text-primary text-lg font-bold rounded-xl">
                {author.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span
              className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-background bg-emerald-500"
              title="Active"
            />
          </div>

          {/* User info */}
          <div className="space-y-0.5">
            <h4 className="text-base font-bold text-foreground leading-tight truncate">
              {author}
            </h4>
            <p className="text-xs text-muted-foreground">Teammate</p>
          </div>

          {/* Local time */}
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground border-t border-border/50 pt-2.5">
            <IconClock className="size-3.5 shrink-0" />
            <span>{localTime} local time</span>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex items-center gap-2">
            {!isCurrentUser && userId && onStartDM && (
              <Button
                size="sm"
                className="flex-1 h-8 text-xs font-semibold rounded-lg shadow-xs"
                onClick={handleStartMessage}
              >
                <IconMessage className="size-3.5 mr-1.5" />
                Message
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-lg px-2.5"
              onClick={handleCopyName}
              title="Copy username"
            >
              {copied ? (
                <IconCheck className="size-3.5 text-emerald-500" />
              ) : (
                <IconCopy className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

