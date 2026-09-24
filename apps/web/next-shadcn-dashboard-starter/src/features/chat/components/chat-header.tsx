"use client";

import { Icons } from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Conversation } from "../utils/types";
import { toast } from "sonner";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChannelMembersPanel } from "./ChannelMembersPanel";
import { PresenceIndicator } from "./PresenceIndicator";
import { useChatStore } from "../utils/store";

const statusDotColor = {
  online: "bg-green-500",
  offline: "bg-red-500",
} as const;

interface ChatHeaderProps {
  conversation: Conversation;
}

export function ChatHeader({
  conversation,
  canManageChannel,
}: ChatHeaderProps & { canManageChannel?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [starred, setStarred] = useState(false);
  const [muted, setMuted] = useState(false);
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const userPresence = useChatStore((state) => state.userPresence);
  const presence = conversation.otherUserId
    ? userPresence[conversation.otherUserId] || "offline"
    : "offline";
  return (
    <header className="border-border/60 bg-muted/30 relative flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3 sm:gap-4 sm:px-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative">
          <Avatar className="border-border/60 bg-background/80 text-foreground h-10 w-10 rounded-2xl border shadow-sm sm:h-12 sm:w-12 sm:rounded-3xl">
            <AvatarFallback className="bg-primary/15 text-primary rounded-2xl text-sm font-semibold sm:rounded-3xl sm:text-base">
              {conversation.initials}
            </AvatarFallback>
          </Avatar>
          {conversation.kind === "dm" && (
            <PresenceIndicator
              state={presence}
              customStatus={conversation.customStatus}
              className="absolute -bottom-1 left-1/2 -translate-x-1/2"
            />
          )}
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
          aria-label={starred ? "Unstar conversation" : "Star conversation"}
          onClick={() => setStarred((value) => !value)}
          title={starred ? "Unstar" : "Star"}
        >
          <Icons.star
            className={cn("size-4", starred && "fill-current text-yellow-500")}
          />
        </Button>
        {conversation.kind === "channel" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => router.push(`/home/${params.workspaceId}/admin`)}
          >
            Invite teammates
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={muted ? "Unmute conversation" : "Mute conversation"}
          onClick={() => setMuted((value) => !value)}
          title={muted ? "Unmute" : "Mute"}
        >
          <Icons.notification
            className={cn("size-4", muted && "text-muted-foreground")}
          />
        </Button>
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
        {conversation.kind === "channel" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => toast.info("Huddles are coming soon")}
          >
            Huddle
          </Button>
        )}
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
                  onClick={() => {
                    setMenuOpen(false);
                    setMembersOpen(true);
                  }}
                  className="hover:bg-accent w-full rounded-lg px-3 py-2 text-left text-xs"
                >
                  Channel members
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
      {conversation.kind === "channel" && (
        <div className="order-3 flex w-full items-center gap-4 border-t border-border/50 pt-2 text-xs">
          <button
            type="button"
            className="border-b-2 border-sidebar-primary pb-1 font-medium"
          >
            Messages
          </button>
          <button
            type="button"
            onClick={() => toast.info("Canvas is coming soon")}
            className="text-muted-foreground hover:text-foreground pb-1"
          >
            Add canvas
          </button>
          <button
            type="button"
            onClick={() => toast.info("Additional tabs are coming soon")}
            className="text-muted-foreground hover:text-foreground pb-1"
          >
            +
          </button>
        </div>
      )}
      {membersOpen &&
        conversation.kind === "channel" &&
        canManageChannel !== undefined && (
          <ChannelMembersPanel
            channelId={conversation.id}
            canManage={canManageChannel}
            onClose={() => setMembersOpen(false)}
          />
        )}
    </header>
  );
}
