"use client";

import { useEffect, useMemo, useState } from "react";
import { Icons } from "@/components/icons";
import { motion } from "motion/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Conversation } from "../utils/types";
import { useChatStore } from "../utils/store";
import { PresenceIndicator } from "./PresenceIndicator";
import { CreateChannelDialog } from "./create-channel-dialog";
import { usePathname, useRouter, useParams } from "next/navigation";
import {
  IconHash,
  IconMessage,
  IconMessageCircle,
  IconStar,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SectionIcon } from "./section-icon";
// import { useParams } from "next/navigation";

interface ConversationListProps {
  conversations?: Conversation[];
  selectedId: string;
  onSelect: (id: string) => void;
  onNewMessage: () => void;
  onCreateChannel: (name: string, type: "PUBLIC" | "PRIVATE") => Promise<void>;
  workspaceName?: string;
  dmOnly?: boolean;
}

export function ConversationList({
  conversations = [],
  selectedId,
  onSelect,
  onNewMessage,
  onCreateChannel,
  workspaceName,
  dmOnly = false,
}: ConversationListProps) {
  const params = useParams();
  const workspaceId =
    typeof params?.workspaceId === "string" ? params.workspaceId : "";
  const userPresence = useChatStore((state) => state.userPresence);

  const [channelsOpen, setChannelsOpen] = useState(true);
  const [directMessagesOpen, setDirectMessagesOpen] = useState(true);
  const [starredOpen, setStarredOpen] = useState(true);
  const [starredHintVisible, setStarredHintVisible] = useState(true);
  const [search, setSearch] = useState("");
  const [unreadsOnly, setUnreadsOnly] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  // const { logout } = useAuth();

  const handleSignOut = async () => {
    // try {
      // await logout();
      // await authService.logout();
    // } finally {
      localStorage.removeItem("active_workspace_id");
      router.replace("/workspaces");
    // }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.title && c.title.toLowerCase().includes(q)),
    );
  }, [conversations, search]);

  const channels = useMemo(
    () => filtered.filter((conversation) => conversation.kind !== "dm"),
    [filtered],
  );

  const directMessages = useMemo(
    () => filtered.filter((conversation) => conversation.kind === "dm"),
    [filtered],
  );

  const visibleDirectMessages = useMemo(() => {
    const list = unreadsOnly
      ? directMessages.filter((conversation) => (conversation.unread || 0) > 0)
      : directMessages;

    return [...list].sort(
      (left, right) =>
        Number(right.name === "You") - Number(left.name === "You"),
    );
  }, [directMessages, unreadsOnly]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent p-3 text-slate-100 lg:p-4">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--chat-sidebar-border,rgba(255,255,255,0.1))] pb-3">
        <div>
          {!dmOnly ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-1 text-sm font-semibold tracking-tight hover:opacity-80"
                    aria-label="Workspace menu"
                  >
                    <span className="truncate">
                      {workspaceName || "Workspace"}
                    </span>
                    <Icons.chevronDown className="size-3.5 shrink-0" />
                  </button>
                }
              />

              <DropdownMenuContent align="start" className="w-56">

                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleSignOut}
                >
                  <Icons.logout className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="text-sm font-semibold tracking-tight">
              Direct messages
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="rounded p-1 text-[var(--chat-sidebar-muted,#94a3b8)] hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))] hover:text-white"
                  aria-label="Sidebar settings"
                  title="Sidebar settings"
                />
              }
            >
              <Icons.settings className="size-5" />
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              className="w-60 gap-0 border-[var(--chat-sidebar-border,rgba(255,255,255,0.1))] bg-[var(--chat-sidebar-bg,#1a1d21)] p-1 text-slate-100"
            >
              <div className="rounded px-3 py-2 text-sm">Preferences</div>
              <div className="rounded px-3 py-2 text-sm">Notification schedule</div>
              <div className="rounded px-3 py-2 text-sm">Set a status</div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={onNewMessage}
            className="rounded p-1 text-[var(--chat-sidebar-muted,#94a3b8)] hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))] hover:text-white"
            aria-label="New message"
            title="New message"
          >
            <Icons.edit className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pt-3 pr-1">
      <div className="relative">
        <label htmlFor="messenger-search" className="sr-only">
          Find a conversation...
        </label>
        <Icons.search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <Input
          id="messenger-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={dmOnly ? "Find a DM..." : "Find a conversation..."}
          className="w-full rounded-xl border-[var(--chat-sidebar-border,rgba(255,255,255,0.1))] bg-slate-950/25 pl-10 text-sm text-slate-100 placeholder:text-[var(--chat-sidebar-muted,#94a3b8)] focus-visible:ring-2 focus-visible:ring-slate-300/40"
        />
      </div>

      {!dmOnly && (
        <nav aria-label="Conversation shortcuts" className="space-y-0.5">
          <button
            type="button"
            onClick={() => router.push(`/home/${workspaceId}/threads`)}
            className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))] hover:text-white", pathname === `/home/${workspaceId}/threads` ? "bg-[var(--chat-sidebar-active,rgba(255,255,255,0.1))] text-white" : "text-[var(--chat-sidebar-muted,#94a3b8)]")}
          >
            <IconMessageCircle className="size-4 shrink-0" />
            <span>Threads</span>
          </button>

          <button
            type="button"
            onClick={() => toast.info("Huddles are coming soon.")}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-[var(--chat-sidebar-muted,#94a3b8)] transition-colors hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))] hover:text-white"
          >
            <Icons.phone className="size-4 shrink-0" /> Huddles
          </button>

          <button
            type="button"
            onClick={() => router.push(`/home/${workspaceId}/directories`)}
            className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))] hover:text-white", pathname === `/home/${workspaceId}/directories` ? "bg-[var(--chat-sidebar-active,rgba(255,255,255,0.1))] text-white" : "text-[var(--chat-sidebar-muted,#94a3b8)]")}
          >
            <Icons.search className="size-4 shrink-0" /> Directories
          </button>
        </nav>
      )}

      {dmOnly && (
        <button
          type="button"
          onClick={() => setUnreadsOnly((value) => !value)}
          className={cn(
            "rounded-lg border border-[var(--chat-sidebar-border,rgba(255,255,255,0.1))] px-3 py-1.5 text-left text-xs font-medium transition-colors",
            unreadsOnly
              ? "bg-[var(--chat-sidebar-active,rgba(255,255,255,0.1))] text-white"
              : "text-[var(--chat-sidebar-muted,#94a3b8)] hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))] hover:text-white",
          )}
          aria-pressed={unreadsOnly}
        >
          {unreadsOnly ? "Unread only" : "Unreads"}
        </button>
      )}

      <div
        className="space-y-1"
        aria-label="Conversation list"
        role="list"
      >
        {!dmOnly && (
          <div className="flex items-center justify-between px-1 pt-1">
            <button
              type="button"
              onClick={() => setChannelsOpen((open) => !open)}
              className="group/row flex items-center gap-1 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[var(--chat-sidebar-muted,#94a3b8)] hover:text-white"
              aria-expanded={channelsOpen}
            >
              <SectionIcon icon={IconHash} open={channelsOpen} />
              Channels
            </button>
            <span className="text-[0.65rem] text-[var(--chat-sidebar-muted,#94a3b8)]">
              {channels.length}
            </span>
            <CreateChannelDialog
              existingChannelNames={channels.map((channel) => channel.name)}
              onCreateChannel={onCreateChannel}
              trigger={
                <button
                  type="button"
                  className="rounded p-1 text-[var(--chat-sidebar-muted,#94a3b8)] hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))]"
                  aria-label="Create channel"
                  title="Create channel"
                >
                  <Icons.add className="size-4" />
                </button>
              }
            />
          </div>
        )}

        {!dmOnly &&
          channelsOpen &&
          channels.map((conversation) => {
            const isActive = conversation.id === selectedId;
            const lastMessage = conversation.messages?.length
              ? conversation.messages[conversation.messages.length - 1]
              : null;

            return (
              <motion.button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "group relative flex w-full items-start gap-3 rounded-lg border border-transparent px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/50",
                  isActive
                    ? "bg-[var(--chat-sidebar-active,rgba(255,255,255,0.1))] text-white"
                    : "text-slate-200 hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))]",
                )}
                role="listitem"
              >
                <div className="relative shrink-0">
                  <Avatar className="h-9 w-9 rounded-lg border border-white/10 bg-slate-700 text-slate-100">
                    <AvatarFallback className="rounded-lg bg-slate-700 text-xs font-semibold text-slate-100">
                      {conversation.initials ||
                        conversation.name?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <PresenceIndicator
                    state={
                      conversation.kind === "channel"
                        ? conversation.status === "online"
                          ? "active"
                          : "offline"
                        : conversation.otherUserId
                          ? userPresence[conversation.otherUserId] || "offline"
                          : "offline"
                    }
                    customStatus={conversation.customStatus}
                    testId={`presence-dot-${conversation.id}`}
                    className="absolute bottom-0 right-0"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm truncate",
                          isActive
                            ? "font-semibold text-white"
                            : "font-medium text-slate-200",
                        )}
                      >
                        {conversation.name}
                      </p>
                      {conversation.title && (
                        <p className="truncate text-xs text-[var(--chat-sidebar-muted,#94a3b8)]">
                          {conversation.title}
                        </p>
                      )}
                    </div>
                    {lastMessage?.timestamp && (
                      <span className="shrink-0 text-[0.62rem] text-[var(--chat-sidebar-muted,#94a3b8)]">
                        {lastMessage.timestamp}
                      </span>
                    )}
                  </div>
                  {lastMessage ? (
                    <p className="line-clamp-2 text-xs text-[var(--chat-sidebar-muted,#94a3b8)]">
                      {lastMessage.author ? `${lastMessage.author}: ` : ""}
                      {lastMessage.text}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--chat-sidebar-muted,#94a3b8)]">
                      No messages yet
                    </p>
                  )}
                </div>
                {(conversation.unread || 0) > 0 && (
                  <span
                    data-testid={`unread-badge-${conversation.id}`}
                    className="ml-auto inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-400 px-1.5 text-[0.65rem] font-bold text-slate-950"
                  >
                    {conversation.unread}
                  </span>
                )}
              </motion.button>
            );
          })}

        {!dmOnly && (
          <div className="mt-4 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setDirectMessagesOpen((open) => !open)}
              className="group/row flex items-center gap-1 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[var(--chat-sidebar-muted,#94a3b8)] hover:text-white"
              aria-expanded={directMessagesOpen}
            >
              <SectionIcon icon={IconMessage} open={directMessagesOpen} />
              Direct messages
            </button>
            <button
              type="button"
              onClick={onNewMessage}
              className="rounded p-1 text-[var(--chat-sidebar-muted,#94a3b8)] hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))]"
              aria-label="Start direct message"
              title="New message"
            >
              <Icons.add className="size-4" />
            </button>
          </div>
        )}

        {directMessagesOpen &&
          visibleDirectMessages.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))]",
                selectedId === conversation.id &&
                  "bg-[var(--chat-sidebar-active,rgba(255,255,255,0.1))] text-white",
              )}
            >
              <Avatar className="size-7 rounded-lg border border-white/10">
                <AvatarFallback className="rounded-lg bg-slate-700 text-[0.6rem] font-semibold text-slate-100">
                  {conversation.initials ||
                    conversation.name?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <PresenceIndicator
                state={
                  conversation.otherUserId
                    ? userPresence[conversation.otherUserId] || "offline"
                    : "offline"
                }
                customStatus={conversation.customStatus}
                testId={`presence-dot-${conversation.id}`}
              />
              <span className="truncate">{conversation.name}</span>
              {(conversation.unread || 0) > 0 && (
                <span
                  data-testid={`unread-badge-${conversation.id}`}
                  className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-rose-400 px-1.5 text-[0.65rem] font-bold text-slate-950"
                >
                  {conversation.unread}
                </span>
              )}
            </button>
          ))}

        <div className="mt-4 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setStarredOpen((open) => !open)}
            className="group/row flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--chat-sidebar-muted,#94a3b8)] hover:text-slate-100"
            aria-expanded={starredOpen}
          >
            <SectionIcon icon={IconStar} open={starredOpen} />
            Starred
          </button>
        </div>

        {!dmOnly && starredOpen && starredHintVisible && (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-[var(--chat-sidebar-muted,#94a3b8)]">
            <span className="flex-1 indent-4">
              Drag and drop important stuff here
            </span>
            <button
              type="button"
              onClick={() => setStarredHintVisible(false)}
              className="hover:text-slate-100"
              aria-label="Hide starred hint"
            >
              ▾
            </button>
          </div>
        )}

      </div>
      </div>
    </div>
  );
}
