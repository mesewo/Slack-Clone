"use client";

import { useEffect, useMemo, useState } from "react";
import { Icons } from "@/components/icons";
import { motion } from "motion/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Conversation } from "../utils/types";
import { useChatStore } from "../utils/store";
import { PresenceIndicator } from "./PresenceIndicator";
import {
  messageService,
  type DirectUser,
} from "@/features/workspace/services/messageService";
import {
  workspaceService,
  type WorkspaceMember,
} from "@/features/workspace/services/workspaceService";
import { useParams } from "next/navigation";

const statusDotColor = {
  online: "bg-green-500",
  offline: "bg-red-500",
} as const;

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreateChannel: (name: string, type: "PUBLIC" | "PRIVATE") => Promise<void>;
  onCreateDM: (userId: string) => Promise<void>;
  dmOnly?: boolean;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onCreateChannel,
  onCreateDM,
  dmOnly = false,
}: ConversationListProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const userPresence = useChatStore((state) => state.userPresence);
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [directMessagesOpen, setDirectMessagesOpen] = useState(true);
  const [starredOpen, setStarredOpen] = useState(true);
  const [starredHintVisible, setStarredHintVisible] = useState(true);
  const [directoriesOpen, setDirectoriesOpen] = useState(false);
  const [directoryTab, setDirectoryTab] = useState("People");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<"PUBLIC" | "PRIVATE">(
    "PUBLIC",
  );
  const [dmOpen, setDmOpen] = useState(false);
  const [dmUsers, setDmUsers] = useState<DirectUser[]>([]);
  const [directoryMembers, setDirectoryMembers] = useState<WorkspaceMember[]>(
    [],
  );
  const [directorySearch, setDirectorySearch] = useState("");
  const [unreadsOnly, setUnreadsOnly] = useState(false);

  useEffect(() => {
    if (!dmOpen) return;
    void messageService
      .listDMUsers()
      .then(setDmUsers)
      .catch(() => setDmUsers([]));
  }, [dmOpen]);

  useEffect(() => {
    if (!directoriesOpen || !workspaceId) return;
    void workspaceService
      .listMembers(workspaceId)
      .then((result) => setDirectoryMembers(result.members))
      .catch(() => setDirectoryMembers([]));
  }, [directoriesOpen, workspaceId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.title.toLowerCase().includes(q),
    );
  }, [conversations, search]);

  const channels = filtered.filter(
    (conversation) => conversation.kind !== "dm",
  );
  const directMessages = filtered.filter(
    (conversation) => conversation.kind === "dm",
  );
  const visibleDirectMessages = (
    unreadsOnly
      ? directMessages.filter((conversation) => conversation.unread > 0)
      : directMessages
  ).sort(
    (left, right) => Number(right.name === "You") - Number(left.name === "You"),
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-transparent p-3 text-slate-100 lg:p-4">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--chat-sidebar-border)] pb-3">
        <div>
          <p className="text-sm font-semibold tracking-tight">
            {dmOnly ? "Direct messages" : "Workspace"}
          </p>
          <p className="text-[var(--chat-sidebar-muted)] text-xs">
            {dmOnly ? "Private conversations" : "Your conversations"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[0.62rem] tracking-[0.2em] text-emerald-200 uppercase"
          >
            Live
          </Badge>
          <button
            type="button"
            onClick={() =>
              dmOnly
                ? setDmOpen((open) => !open)
                : setCreateOpen((open) => !open)
            }
            className="text-[var(--chat-sidebar-muted)] hover:bg-[var(--chat-sidebar-hover)] hover:text-white rounded p-1"
            aria-label="Create channel"
            title={dmOnly ? "Start direct message" : "Create channel"}
          >
            <Icons.add className="size-4" />
          </button>
        </div>
      </div>

      {createOpen && !dmOnly && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await onCreateChannel(channelName, channelType);
            setChannelName("");
            setCreateOpen(false);
          }}
          className="border-border/40 bg-muted/30 space-y-2 rounded-lg border p-2"
        >
          <Input
            value={channelName}
            onChange={(event) => setChannelName(event.target.value)}
            placeholder="channel-name"
            aria-label="Channel name"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <select
              value={channelType}
              onChange={(event) =>
                setChannelType(event.target.value as "PUBLIC" | "PRIVATE")
              }
              className="bg-background text-foreground border-border/40 h-8 flex-1 rounded border px-2 text-xs"
            >
              <option value="PUBLIC">Public</option>
              <option value="PRIVATE">Private</option>
            </select>
            <button
              type="submit"
              disabled={!channelName.trim()}
              className="bg-primary text-primary-foreground h-8 rounded px-2 text-xs disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>
      )}

      <label htmlFor="messenger-search" className="sr-only">
        Search conversations
      </label>
      <div className="relative">
        <Icons.search
          className="text-muted-foreground/70 pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          id="messenger-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={dmOnly ? "Find a DM..." : "Search conversations"}
          className="border-[var(--chat-sidebar-border)] bg-slate-950/25 text-slate-100 placeholder:text-[var(--chat-sidebar-muted)] focus-visible:ring-slate-300/40 w-full rounded-xl pl-10 text-sm focus-visible:ring-2"
        />
      </div>
      {dmOnly && (
        <button
          type="button"
          onClick={() => setUnreadsOnly((value) => !value)}
          className={cn(
            "border-[var(--chat-sidebar-border)] rounded-lg border px-3 py-1.5 text-left text-xs font-medium transition-colors",
            unreadsOnly
              ? "bg-[var(--chat-sidebar-active)] text-white"
              : "text-[var(--chat-sidebar-muted)] hover:bg-[var(--chat-sidebar-hover)] hover:text-white",
          )}
          aria-pressed={unreadsOnly}
        >
          {unreadsOnly ? "Unread only" : "Unreads"}
        </button>
      )}

      <div
        className="flex-1 space-y-1 overflow-y-auto pr-1"
        aria-label="Conversation list"
        role="list"
      >
        {!dmOnly && (
          <div className="flex items-center justify-between px-1 pt-1">
            <button
              type="button"
              onClick={() => setChannelsOpen((open) => !open)}
              className="text-[var(--chat-sidebar-muted)] hover:text-white flex items-center gap-1 text-[0.64rem] font-semibold uppercase tracking-[0.16em]"
              aria-expanded={channelsOpen}
            >
              <Icons.chevronRight
                className={cn(
                  "size-3 transition-transform",
                  channelsOpen && "rotate-90",
                )}
              />
              Channels
            </button>
            <span className="text-[var(--chat-sidebar-muted)] text-[0.65rem]">
              {channels.length}
            </span>
            <button
              type="button"
              onClick={() => setCreateOpen((open) => !open)}
              className="text-[var(--chat-sidebar-muted)] hover:bg-[var(--chat-sidebar-hover)] rounded p-1"
              aria-label="Create channel"
              title="Create channel"
            >
              <Icons.add className="size-4" />
            </button>
          </div>
        )}
        {!dmOnly &&
          channelsOpen &&
          channels.map((conversation) => {
            const isActive = conversation.id === selectedId;
            const lastMessage =
              conversation.messages[conversation.messages.length - 1];
            return (
              <motion.button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "focus-visible:ring-slate-300/50 group relative flex w-full items-start gap-3 rounded-lg border border-transparent px-2.5 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  isActive
                    ? "bg-[var(--chat-sidebar-active)] text-white"
                    : "text-slate-200 hover:bg-[var(--chat-sidebar-hover)]",
                )}
                role="listitem"
              >
                <div className="relative shrink-0">
                  <Avatar className="h-9 w-9 rounded-lg border border-white/10 bg-slate-700 text-slate-100">
                    <AvatarFallback className="rounded-lg bg-slate-700 text-xs font-semibold text-slate-100">
                      {conversation.initials}
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
                    className="absolute right-0 bottom-0"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm",
                          isActive
                            ? "font-semibold text-white"
                            : "font-medium text-slate-200",
                        )}
                      >
                        {conversation.name}
                      </p>
                      <p className="text-[var(--chat-sidebar-muted)] text-xs">
                        {conversation.title}
                      </p>
                    </div>
                    {lastMessage && (
                      <span className="text-[var(--chat-sidebar-muted)] shrink-0 text-[0.62rem]">
                        {lastMessage.timestamp}
                      </span>
                    )}
                  </div>
                  {lastMessage ? (
                    <p className="text-[var(--chat-sidebar-muted)] line-clamp-2 text-xs">
                      {lastMessage.author}: {lastMessage.text}
                    </p>
                  ) : (
                    <p className="text-[var(--chat-sidebar-muted)] text-xs">
                      No messages yet
                    </p>
                  )}
                </div>
                {conversation.unread > 0 && (
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
              className="text-[var(--chat-sidebar-muted)] hover:text-white flex items-center gap-1 text-[0.64rem] font-semibold uppercase tracking-[0.16em]"
              aria-expanded={directMessagesOpen}
            >
              <Icons.chevronRight
                className={cn(
                  "size-3 transition-transform",
                  directMessagesOpen && "rotate-90",
                )}
              />
              Direct messages
            </button>
            <button
              type="button"
              onClick={() => setDmOpen((open) => !open)}
              className="text-[var(--chat-sidebar-muted)] hover:bg-[var(--chat-sidebar-hover)] rounded p-1"
              aria-label="Start direct message"
            >
              <Icons.add className="size-4" />
            </button>
          </div>
        )}
        {directMessagesOpen && dmOpen && (
          <div className="border-border/40 bg-muted/30 my-1 rounded-lg border p-2">
            <label className="mb-2 block text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              To:
            </label>
            <select
              defaultValue={[]}
              multiple
              size={Math.min(dmUsers.length || 1, 6)}
              onChange={async (event) => {
                const selected = Array.from(event.target.selectedOptions).map(
                  (option) => option.value,
                );
                if (selected.length === 0) return;
                for (const userId of selected) {
                  await onCreateDM(userId);
                }
                setDmOpen(false);
              }}
              className="bg-background text-foreground border-border/40 h-24 w-full rounded border px-2 py-1 text-xs"
            >
              {dmUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name || user.email}
                </option>
              ))}
            </select>
          </div>
        )}
        {directMessagesOpen &&
          visibleDirectMessages.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-[var(--chat-sidebar-hover)]",
                selectedId === conversation.id &&
                  "bg-[var(--chat-sidebar-active)] text-white",
              )}
            >
              <Avatar className="size-7 rounded-lg border border-white/10">
                <AvatarFallback className="rounded-lg bg-slate-700 text-[0.6rem] font-semibold text-slate-100">
                  {conversation.initials}
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
              {conversation.unread > 0 && (
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
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
            aria-expanded={starredOpen}
          >
            <Icons.chevronRight
              className={cn(
                "size-3 transition-transform",
                starredOpen && "rotate-90",
              )}
            />
            Starred
          </button>
        </div>
        {!dmOnly && starredOpen && starredHintVisible && (
          <div className="text-muted-foreground flex items-center gap-2 px-2 py-2 text-xs">
            <span className="flex-1 indent-4">
              Drag and drop important stuff here
            </span>
            <button
              type="button"
              onClick={() => setStarredHintVisible(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Hide starred hint"
            >
              ▾
            </button>
          </div>
        )}
        {!dmOnly && (
          <button
            type="button"
            onClick={() => toast.info("Huddles are coming soon.")}
            className="text-muted-foreground hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
          >
            <Icons.phone className="size-4" /> Huddles
          </button>
        )}
        {!dmOnly && (
          <button
            type="button"
            onClick={() => setDirectoriesOpen((open) => !open)}
            className="text-muted-foreground hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
            aria-expanded={directoriesOpen}
          >
            <Icons.search className="size-4" /> Directories
          </button>
        )}
        {!dmOnly && directoriesOpen && (
          <div className="border-border/60 bg-muted/30 space-y-2 rounded-lg border p-2">
            <div className="flex flex-wrap gap-1">
              {[
                "People",
                "Channels",
                "User groups",
                "External",
                "Invitations",
              ].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDirectoryTab(tab)}
                  className={cn(
                    "rounded px-1.5 py-1 text-[0.65rem]",
                    directoryTab === tab
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
            {directoryTab === "People" && (
              <>
                <Input
                  value={directorySearch}
                  onChange={(event) => setDirectorySearch(event.target.value)}
                  placeholder="Search people"
                  aria-label="Search people"
                  className="h-8 text-xs"
                />
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {directoryMembers
                    .filter((member) =>
                      `${member.display_name} ${member.email}`
                        .toLowerCase()
                        .includes(directorySearch.toLowerCase()),
                    )
                    .map((member) => (
                      <button
                        key={member.user_id}
                        type="button"
                        onClick={() => {
                          onCreateDM(member.user_id).catch(() => undefined);
                          setDirectoriesOpen(false);
                        }}
                        className="hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left"
                      >
                        <Avatar className="size-6 rounded-md">
                          <AvatarFallback className="bg-primary/15 text-primary rounded-md text-[0.55rem] font-semibold">
                            {member.display_name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-xs">
                          {member.display_name || member.email}
                        </span>
                        <PresenceIndicator
                          state={
                            member.presence_status === "active"
                              ? "active"
                              : "offline"
                          }
                        />
                      </button>
                    ))}
                  {directoryMembers.length === 0 && (
                    <p className="text-muted-foreground px-2 py-2 text-xs">
                      No people found.
                    </p>
                  )}
                </div>
              </>
            )}
            {directoryTab === "Channels" && (
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {channels.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => {
                      onSelect(conversation.id);
                      setDirectoriesOpen(false);
                    }}
                    className="hover:bg-accent flex w-full items-center rounded px-2 py-1.5 text-left text-xs"
                  >
                    {conversation.name}
                  </button>
                ))}
                {channels.length === 0 && (
                  <p className="text-muted-foreground px-2 py-2 text-xs">
                    No channels found.
                  </p>
                )}
              </div>
            )}
            {!["People", "Channels"].includes(directoryTab) && (
              <p className="text-muted-foreground px-2 py-2 text-xs">
                This directory is not available in this workspace yet.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
