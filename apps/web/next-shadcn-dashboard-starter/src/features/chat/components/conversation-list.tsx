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
import { useAuth } from "@/lib/auth";
import {
  IconHash,
  IconListSearch,
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
import { starService, type StarredConversation } from "@/features/workspace/services/starService";
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
  const [starredConversations, setStarredConversations] = useState<StarredConversation[]>([]);
  const [starsLoaded, setStarsLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [unreadsOnly, setUnreadsOnly] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    void starService.list().then((items) => {
      if (!cancelled) setStarredConversations(items);
    }).catch(() => {
      if (!cancelled) setStarredConversations([]);
    }).finally(() => {
      if (!cancelled) setStarsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const getStarTarget = (conversation: Conversation) => ({
    kind: conversation.kind === "dm" ? "dm" as const : "channel" as const,
    id: conversation.kind === "dm" ? conversation.dmId || conversation.id.replace(/^dm:/, "") : conversation.id,
  });
  const isStarred = (conversation: Conversation) => {
    const { kind, id } = getStarTarget(conversation);
    return starredConversations.some((item) =>
      kind === "channel" ? item.channel_id === id : item.conversation_id === id,
    );
  };
  const toggleStar = async (conversation: Conversation) => {
    const { kind, id } = getStarTarget(conversation);
    const wasStarred = isStarred(conversation);
    try {
      if (wasStarred) await starService.unstar(kind, id);
      else await starService.star(kind, id);
      setStarredConversations(await starService.list());
      toast.success(wasStarred ? "Removed from Starred" : "Added to Starred");
    } catch {
      toast.error("Couldn't update Starred");
    }
  };

  const visibleStarredConversations = useMemo(() =>
    (Array.isArray(starredConversations) ? starredConversations : []).flatMap((star) => {
      const conversation = conversations.find((item) =>
        star.channel_id
          ? item.kind !== "dm" && item.id === star.channel_id
          : item.kind === "dm" && (item.dmId || item.id.replace(/^dm:/, "")) === star.conversation_id,
      );
      return conversation ? [conversation] : [];
    }), [conversations, starredConversations]);

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
          {dmOnly && (
            <button
              type="button"
              onClick={() => setUnreadsOnly((value) => !value)}
              role="switch"
              aria-checked={unreadsOnly}
              aria-label="Show unread direct messages only"
              className="flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-[var(--chat-sidebar-muted,#94a3b8)] hover:text-white"
            >
              <span>Unreads</span>
              <span className={cn("flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", unreadsOnly ? "bg-emerald-500" : "bg-white/20")}>
                <span className={cn("size-4 rounded-full bg-white shadow-sm transition-transform", unreadsOnly && "translate-x-4")} />
              </span>
            </button>
          )}
          {!dmOnly && (
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
                className="w-60 gap-0 border-[var(--chat-sidebar-border,rgba(255,255,255,0.1))] bg-[var(--chat-sidebar-bg,#1a1d21)] p-1 text-slate-100 shadow-[var(--shadow-menu)]"
              >
                <div className="rounded px-3 py-2 text-sm">Preferences</div>
                <div className="rounded px-3 py-2 text-sm">Notification schedule</div>
                <div className="rounded px-3 py-2 text-sm">Set a status</div>
              </PopoverContent>
            </Popover>
          )}
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
        <IconListSearch
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <Input
          id="messenger-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={dmOnly ? "Find a DM..." : "Find a conversation..."}
          className="w-full rounded-lg border-[var(--chat-sidebar-border,rgba(255,255,255,0.1))] bg-slate-950/25 pl-10 text-sm text-slate-100 placeholder:text-[var(--chat-sidebar-muted,#94a3b8)] focus-visible:ring-2 focus-visible:ring-slate-300/40"
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

      <div
        className={cn("space-y-1", dmOnly && "border-b border-[var(--chat-sidebar-border,rgba(255,255,255,0.1))] pb-3")}
        aria-label="Conversation list"
        role="list"
      >
        {!dmOnly && (
          <div className="flex items-center justify-between px-1 pt-1">
            <button
              type="button"
              onClick={() => setChannelsOpen((open) => !open)}
              className="group/row flex items-center gap-1 text-sm font-medium text-[var(--chat-sidebar-muted,#94a3b8)] hover:text-white"
              aria-expanded={channelsOpen}
            >
              <SectionIcon icon={IconHash} open={channelsOpen} />
              Channels
            </button>
            <span className="flex-1" />
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
            const isUnread = (conversation.unread || 0) > 0;

            return (
              <motion.div
                key={conversation.id}
                className="group relative"
                role="listitem"
              >
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex h-7 w-full items-center gap-2 rounded-md border border-transparent px-2 pr-8 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/50",
                  isActive
                    ? "bg-[var(--chat-sidebar-active,rgba(255,255,255,0.1))] text-white"
                    : "text-slate-200 hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))]",
                )}
              >
                <IconHash className="size-4 shrink-0 text-[var(--chat-sidebar-muted,#94a3b8)]" />
                <span className={cn("min-w-0 flex-1 truncate", isUnread ? "font-bold" : "font-normal")}>
                  {conversation.name.replace(/^#\s*/, "")}
                </span>
                {isUnread && (
                  <span
                    data-testid={`unread-badge-${conversation.id}`}
                    className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-400 px-1.5 text-[0.65rem] font-bold text-slate-950"
                  >
                    {conversation.unread}
                  </span>
                )}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<button type="button" aria-label={`More actions for ${conversation.name}`} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--chat-sidebar-muted,#94a3b8)] opacity-100 hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))] hover:text-white sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"><Icons.ellipsis className="size-4" /></button>} />
                <DropdownMenuContent align="end" className="shadow-[var(--shadow-menu)]">
                  <DropdownMenuItem onClick={() => void toggleStar(conversation)}>{isStarred(conversation) ? "Unstar conversation" : "Star conversation"}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </motion.div>
            );
          })}

        {!dmOnly && (
          <div className="mt-4 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setDirectMessagesOpen((open) => !open)}
              className="group/row flex items-center gap-1 text-sm font-medium text-[var(--chat-sidebar-muted,#94a3b8)] hover:text-white"
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

        {(dmOnly || directMessagesOpen) &&
          visibleDirectMessages.map((conversation) => (
            <div key={conversation.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(conversation.id)}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 pr-8 text-left text-sm text-slate-200 transition-colors hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))]",
                selectedId === conversation.id &&
                  "bg-[var(--chat-sidebar-active,rgba(255,255,255,0.1))] text-white",
              )}
            >
              <span className="relative size-7 shrink-0">
                <Avatar className="size-7 rounded-md border border-white/10">
                  <AvatarFallback className="rounded-md bg-slate-700 text-[0.6rem] font-semibold text-slate-100">
                    {conversation.initials || conversation.name?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <PresenceIndicator
                  state={conversation.otherUserId ? userPresence[conversation.otherUserId] || "offline" : "offline"}
                  testId={`presence-dot-${conversation.id}`}
                  className="absolute right-0 bottom-0"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate">
                    {conversation.name === "You" ? `${user?.name || "You"} (you)` : conversation.name}
                  </span>
                  {conversation.lastMessage && conversation.lastMessageAt && (
                    <time className="text-[0.65rem] text-[var(--chat-sidebar-muted,#94a3b8)]">
                      {new Date(conversation.lastMessageAt).toLocaleDateString(undefined, { weekday: "long" })}
                    </time>
                  )}
                </span>
                {conversation.lastMessage && (
                  <span className="mt-0.5 block truncate text-xs text-[var(--chat-sidebar-muted,#94a3b8)]">
                    {conversation.lastMessageIsMine ? "You" : conversation.name}: {conversation.lastMessage}
                  </span>
                )}
              </span>
              {(conversation.unread || 0) > 0 && (
                <span
                  data-testid={`unread-badge-${conversation.id}`}
                  className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-rose-400 px-1.5 text-[0.65rem] font-bold text-slate-950"
                >
                  {conversation.unread}
                </span>
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<button type="button" aria-label={`More actions for ${conversation.name}`} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--chat-sidebar-muted,#94a3b8)] opacity-100 hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))] hover:text-white sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"><Icons.ellipsis className="size-4" /></button>} />
              <DropdownMenuContent align="end" className="shadow-[var(--shadow-menu)]">
                <DropdownMenuItem onClick={() => void toggleStar(conversation)}>{isStarred(conversation) ? "Unstar conversation" : "Star conversation"}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          ))}

        <div className="mt-4 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setStarredOpen((open) => !open)}
            className="group/row flex items-center gap-1 text-sm font-medium text-[var(--chat-sidebar-muted,#94a3b8)] hover:text-slate-100"
            aria-expanded={starredOpen}
          >
            <SectionIcon icon={IconStar} open={starredOpen} />
            Starred
          </button>
        </div>

        {starredOpen && visibleStarredConversations.filter((conversation) => !dmOnly || conversation.kind === "dm").map((conversation) => (
          <button key={`starred-${conversation.id}`} type="button" onClick={() => onSelect(conversation.id)} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-slate-200 transition-colors hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))]">
            {conversation.kind === "dm" ? <IconMessage className="size-4 shrink-0 text-[var(--chat-sidebar-muted,#94a3b8)]" /> : <IconHash className="size-4 shrink-0 text-[var(--chat-sidebar-muted,#94a3b8)]" />}
            <span className="truncate">{conversation.kind === "dm" ? conversation.name : conversation.name.replace(/^#\s*/, "")}</span>
          </button>
        ))}

        {!dmOnly && starredOpen && starsLoaded && visibleStarredConversations.length === 0 && starredHintVisible && (
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
