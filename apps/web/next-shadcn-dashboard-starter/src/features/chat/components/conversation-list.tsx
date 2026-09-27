"use client";

import { useEffect, useMemo, useState, ChangeEvent } from "react";
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
import {
  messageService,
  type DirectUser,
} from "@/features/workspace/services/messageService";
import { IconMessageCircle } from "@tabler/icons-react";
import {
  workspaceService,
  type WorkspaceMember,
} from "@/features/workspace/services/workspaceService";
import { useParams } from "next/navigation";

interface ConversationListProps {
  conversations?: Conversation[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreateChannel: (name: string, type: "PUBLIC" | "PRIVATE") => Promise<void>;
  onCreateDM: (userId: string) => Promise<void>;
  workspaceName?: string;
  dmOnly?: boolean;
}

export function ConversationList({
  conversations = [],
  selectedId,
  onSelect,
  onCreateChannel,
  onCreateDM,
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
    let isMounted = true;
    messageService
      .listDMUsers()
      .then((data) => {
        if (isMounted) setDmUsers(data || []);
      })
      .catch(() => {
        if (isMounted) setDmUsers([]);
      });
    return () => {
      isMounted = false;
    };
  }, [dmOpen]);

  useEffect(() => {
    if (!directoriesOpen || !workspaceId) return;
    let isMounted = true;
    workspaceService
      .listMembers(workspaceId)
      .then((result) => {
        if (isMounted) setDirectoryMembers(result?.members || []);
      })
      .catch(() => {
        if (isMounted) setDirectoryMembers([]);
      });
    return () => {
      isMounted = false;
    };
  }, [directoriesOpen, workspaceId]);

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

  const handleSelectDMUsers = async (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedOptions = Array.from(
      event.target.selectedOptions,
      (opt) => opt.value,
    );
    if (selectedOptions.length === 0) return;

    try {
      for (const userId of selectedOptions) {
        await onCreateDM(userId);
      }
      setDmOpen(false);
    } catch {
      toast.error("Failed to initiate direct message");
    }
  };

  const handleCreateChannelSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!channelName.trim()) return;
    try {
      await onCreateChannel(channelName.trim(), channelType);
      setChannelName("");
      setCreateOpen(false);
    } catch {
      toast.error("Failed to create channel");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-transparent p-3 text-slate-100 lg:p-4">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--chat-sidebar-border,rgba(255,255,255,0.1))] pb-3">
        <div>
          <button
            type="button"
            className="flex min-w-0 items-center gap-1 text-sm font-semibold tracking-tight hover:opacity-80"
            aria-label="Workspace menu"
          >
            <span className="truncate">
              {dmOnly ? "Direct messages" : workspaceName || "Workspace"}
            </span>
            {!dmOnly && <Icons.chevronDown className="size-3.5 shrink-0" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Icons.settings className="size-5 text-[var(--chat-sidebar-muted,#94a3b8)]" />
          <button
            type="button"
            onClick={() =>
              dmOnly
                ? setDmOpen((open) => !open)
                : setCreateOpen((open) => !open)
            }
            className="rounded p-1 text-[var(--chat-sidebar-muted,#94a3b8)] hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))] hover:text-white"
            aria-label={dmOnly ? "Start direct message" : "Create channel"}
            title={dmOnly ? "Start direct message" : "Create channel"}
          >
            <Icons.add className="size-4" />
          </button>
        </div>
      </div>

      {createOpen && !dmOnly && (
        <form
          onSubmit={handleCreateChannelSubmit}
          className="space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-2"
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
              className="h-8 flex-1 rounded border border-white/10 bg-slate-950 px-2 text-xs text-slate-100"
            >
              <option value="PUBLIC">Public</option>
              <option value="PRIVATE">Private</option>
            </select>
            <button
              type="submit"
              disabled={!channelName.trim()}
              className="h-8 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>
      )}

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
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-[var(--chat-sidebar-muted,#94a3b8)] transition-colors hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))] hover:text-white"
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
            onClick={() => setDirectoriesOpen((open) => !open)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-[var(--chat-sidebar-muted,#94a3b8)] transition-colors hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))] hover:text-white"
            aria-expanded={directoriesOpen}
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
        className="flex-1 space-y-1 overflow-y-auto pr-1"
        aria-label="Conversation list"
        role="list"
      >
        {!dmOnly && (
          <div className="flex items-center justify-between px-1 pt-1">
            <button
              type="button"
              onClick={() => setChannelsOpen((open) => !open)}
              className="flex items-center gap-1 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[var(--chat-sidebar-muted,#94a3b8)] hover:text-white"
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
            <span className="text-[0.65rem] text-[var(--chat-sidebar-muted,#94a3b8)]">
              {channels.length}
            </span>
            <button
              type="button"
              onClick={() => setCreateOpen((open) => !open)}
              className="rounded p-1 text-[var(--chat-sidebar-muted,#94a3b8)] hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))]"
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
              className="flex items-center gap-1 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[var(--chat-sidebar-muted,#94a3b8)] hover:text-white"
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
              className="rounded p-1 text-[var(--chat-sidebar-muted,#94a3b8)] hover:bg-[var(--chat-sidebar-hover,rgba(255,255,255,0.05))]"
              aria-label="Start direct message"
            >
              <Icons.add className="size-4" />
            </button>
          </div>
        )}

        {directMessagesOpen && dmOpen && (
          <div className="my-1 rounded-lg border border-white/10 bg-slate-900/40 p-2">
            <label className="mb-2 block text-[0.65rem] font-medium uppercase tracking-[0.12em] text-slate-400">
              To:
            </label>
            <select
              defaultValue={[]}
              multiple
              size={Math.min(dmUsers.length || 1, 6)}
              onChange={handleSelectDMUsers}
              className="h-24 w-full rounded border border-white/10 bg-slate-950 px-2 py-1 text-xs text-slate-100"
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
            className="flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--chat-sidebar-muted,#94a3b8)] hover:text-slate-100"
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

        {!dmOnly && directoriesOpen && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-2">
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
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:bg-slate-800",
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
                      `${member.display_name || ""} ${member.email || ""}`
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
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-800"
                      >
                        <Avatar className="size-6 rounded-md">
                          <AvatarFallback className="rounded-md bg-primary/15 text-[0.55rem] font-semibold text-primary">
                            {(member.display_name || member.email || "U")
                              .slice(0, 2)
                              .toUpperCase()}
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
                    <p className="px-2 py-2 text-xs text-slate-400">
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
                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-slate-800"
                  >
                    {conversation.name}
                  </button>
                ))}
                {channels.length === 0 && (
                  <p className="px-2 py-2 text-xs text-slate-400">
                    No channels found.
                  </p>
                )}
              </div>
            )}
            {!["People", "Channels"].includes(directoryTab) && (
              <p className="px-2 py-2 text-xs text-slate-400">
                This directory is not available in this workspace yet.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
