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
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onCreateChannel,
  onCreateDM,
}: ConversationListProps) {
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

  useEffect(() => {
    if (!dmOpen) return;
    void messageService
      .listDMUsers()
      .then(setDmUsers)
      .catch(() => setDmUsers([]));
  }, [dmOpen]);

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

  return (
    <div className="border-border/40 bg-background/75 flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-2xl border p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur lg:rounded-3xl lg:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-foreground text-sm font-semibold">Workspace</p>
          <p className="text-muted-foreground text-xs">Your conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-primary/15 text-primary border-border/50 rounded-full border px-3 py-1 text-[0.7rem] tracking-[0.24em] uppercase"
          >
            Live
          </Badge>
          <button
            type="button"
            onClick={() => setCreateOpen((open) => !open)}
            className="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1"
            aria-label="Create channel"
            title="Create channel"
          >
            <Icons.add className="size-4" />
          </button>
        </div>
      </div>

      {createOpen && (
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
          placeholder="Search conversations"
          className="border-border/40 bg-background/60 text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary/40 w-full rounded-2xl pl-10 text-sm focus-visible:ring-2"
        />
      </div>

      <div
        className="flex-1 space-y-1 overflow-y-auto pr-1"
        aria-label="Conversation list"
        role="list"
      >
        <div className="flex items-center justify-between px-1 pt-1">
          <button
            type="button"
            onClick={() => setChannelsOpen((open) => !open)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
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
          <span className="text-muted-foreground/70 text-[0.65rem]">
            {channels.length}
          </span>
        </div>
        {channelsOpen &&
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
                  "focus-visible:ring-primary/50 group focus-visible:ring-offset-background relative flex w-full items-start gap-3 rounded-2xl border border-transparent p-3 text-left transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  isActive
                    ? "border-primary/30 bg-[linear-gradient(180deg,rgba(99,102,241,0.08),rgba(99,102,241,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                    : "bg-background/70 hover:border-border/50 hover:bg-muted/45",
                )}
                role="listitem"
              >
                <div className="relative shrink-0">
                  <Avatar className="border-border/40 bg-background/80 text-foreground h-10 w-10 rounded-2xl border">
                    <AvatarFallback className="bg-primary/15 text-primary rounded-2xl text-sm font-medium">
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
                    className="absolute right-0 bottom-0"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          isActive ? "text-foreground" : "text-foreground/90",
                        )}
                      >
                        {conversation.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {conversation.title}
                      </p>
                    </div>
                    {lastMessage && (
                      <span className="text-muted-foreground shrink-0 text-[0.65rem]">
                        {lastMessage.timestamp}
                      </span>
                    )}
                  </div>
                  {lastMessage ? (
                    <p className="text-muted-foreground line-clamp-2 text-xs">
                      {lastMessage.author}: {lastMessage.text}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      No messages yet
                    </p>
                  )}
                </div>
                {conversation.unread > 0 && (
                  <span className="bg-primary text-primary-foreground ml-2 inline-flex min-h-[1.5rem] min-w-[1.5rem] items-center justify-center rounded-full text-[0.7rem] font-semibold shadow-lg">
                    {conversation.unread}
                  </span>
                )}
              </motion.button>
            );
          })}
        <div className="mt-4 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setDirectMessagesOpen((open) => !open)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
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
            className="text-muted-foreground hover:bg-accent rounded p-1"
            aria-label="Start direct message"
          >
            <Icons.add className="size-4" />
          </button>
        </div>
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
          directMessages.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              className={cn(
                "hover:bg-muted/40 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                selectedId === conversation.id && "bg-primary/10 text-primary",
              )}
            >
              <Avatar className="size-7 rounded-lg">
                <AvatarFallback className="bg-primary/15 text-primary rounded-lg text-[0.6rem] font-semibold">
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
              />
              <span className="truncate">{conversation.name}</span>
              {conversation.unread > 0 && (
                <span className="bg-primary text-primary-foreground ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1 text-[0.65rem] font-semibold">
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
        {starredOpen && starredHintVisible && (
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
        <button
          type="button"
          onClick={() => toast.info("Huddles are coming soon.")}
          className="text-muted-foreground hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
        >
          <Icons.phone className="size-4" /> Huddles
        </button>
        <button
          type="button"
          onClick={() => setDirectoriesOpen((open) => !open)}
          className="text-muted-foreground hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
          aria-expanded={directoriesOpen}
        >
          <Icons.search className="size-4" /> Directories
        </button>
        {directoriesOpen && (
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
            <p className="text-muted-foreground text-xs">
              {directoryTab} directory search is coming soon.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
