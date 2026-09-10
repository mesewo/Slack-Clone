"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  IconChevronDown,
  IconHash,
  IconMessageCircle,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  channelService,
  type Channel,
} from "@/features/workspace/services/channelService";
import {
  messageService,
  type DirectConversation,
} from "@/features/workspace/services/messageService";
import {
  workspaceService,
  type Workspace,
} from "@/features/workspace/services/workspaceService";
import { WorkspaceConversationSidebar } from "./WorkspaceConversationSidebar";

type UnreadCounts = Record<string, number>;

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ workspaceId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const workspaceId = params.workspaceId;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectConversation[]>(
    [],
  );
  const [channelUnread, setChannelUnread] = useState<UnreadCounts>({});
  const [dmUnread, setDmUnread] = useState<UnreadCounts>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<"PUBLIC" | "PRIVATE">(
    "PUBLIC",
  );
  const [createDMOpen, setCreateDMOpen] = useState(false);
  const [dmUsers, setDMUsers] = useState<
    Array<{ id: string; display_name: string; email: string }>
  >([]);

  useEffect(() => {
    let active = true;

    async function loadWorkspaceData() {
      try {
        const [workspaceList, channelList, dmList] = await Promise.all([
          workspaceService.list(),
          channelService.list(workspaceId),
          messageService.listDMs(),
        ]);

        if (!active) return;
        setWorkspaces(workspaceList);
        setChannels(channelList);
        setDirectMessages(dmList);

        const [channelCounts, directMessageCounts] = await Promise.all([
          Promise.all(
            channelList.map(
              async (channel) =>
                [
                  channel.id,
                  await messageService.getChannelUnread(channel.id),
                ] as const,
            ),
          ),
          Promise.all(
            dmList.map(
              async (conversation) =>
                [
                  conversation.id,
                  await messageService.getDMUnread(conversation.id),
                ] as const,
            ),
          ),
        ]);

        if (!active) return;
        setChannelUnread(Object.fromEntries(channelCounts));
        setDmUnread(Object.fromEntries(directMessageCounts));
      } catch {
        if (active) setError("Unable to load this workspace.");
      }
    }

    void loadWorkspaceData();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId),
    [workspaces, workspaceId],
  );

  const filteredChannels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? channels.filter((channel) => channel.name.toLowerCase().includes(query))
      : channels;
  }, [channels, search]);

  const filteredDMs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? directMessages.filter((conversation) =>
          `${conversation.other_display_name} ${conversation.other_email}`
            .toLowerCase()
            .includes(query),
        )
      : directMessages;
  }, [directMessages, search]);

  async function createChannel() {
    if (!channelName.trim()) return;
    try {
      const channel = await channelService.create({
        workspace_id: workspaceId,
        name: channelName.trim().replace(/^#/, ""),
        type: channelType,
      });
      setChannels((current) => [...current, channel]);
      setChannelName("");
      setCreateChannelOpen(false);
      router.push(`/workspace/${workspaceId}/channels/${channel.id}`);
    } catch {
      setError("Unable to create channel.");
    }
  }

  async function openDMUser(userId: string) {
    try {
      const result = await messageService.createDM(userId);
      router.push(`/workspace/${workspaceId}/dms/${result.id}`);
      setCreateDMOpen(false);
    } catch {
      setError("Unable to start direct message.");
    }
  }

  function switchWorkspace(nextWorkspaceId: string) {
    router.push(`/workspace/${nextWorkspaceId}`);
  }

  return (
    <div className="bg-background flex min-h-svh">
      <aside className="bg-sidebar text-sidebar-foreground flex w-72 shrink-0 flex-col border-r">
        <div className="border-sidebar-border flex h-14 items-center border-b px-4">
          <label className="sr-only" htmlFor="workspace-switcher">
            Switch workspace
          </label>
          <select
            id="workspace-switcher"
            className="bg-sidebar w-full cursor-pointer appearance-none truncate rounded-md px-2 py-1.5 text-sm font-semibold outline-none"
            value={workspaceId}
            onChange={(event) => switchWorkspace(event.target.value)}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <IconChevronDown className="pointer-events-none -ml-6 size-4" />
        </div>

        <WorkspaceConversationSidebar />
        <ScrollArea className="hidden min-h-0 flex-1">
          <div className="space-y-6 px-3 py-4">
            <div className="relative px-1">
              <label
                htmlFor="workspace-conversation-search"
                className="sr-only"
              >
                Search conversations
              </label>
              <Input
                id="workspace-conversation-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conversations"
                className="bg-sidebar-accent/50 h-8 text-xs"
              />
            </div>
            <section aria-labelledby="channels-heading">
              <div className="flex items-center justify-between px-2 pb-2">
                <h2
                  id="channels-heading"
                  className="text-sidebar-foreground/70 text-xs font-semibold uppercase tracking-wide"
                >
                  Channels
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-sidebar-foreground/70 size-6"
                  aria-label="Create channel"
                  onClick={() => setCreateChannelOpen((open) => !open)}
                >
                  <IconPlus className="size-4" />
                </Button>
              </div>
              {createChannelOpen && (
                <form
                  className="space-y-2 px-2 pb-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createChannel();
                  }}
                >
                  <Input
                    value={channelName}
                    onChange={(event) => setChannelName(event.target.value)}
                    placeholder="channel-name"
                    aria-label="Channel name"
                    autoFocus
                    className="h-8 text-xs"
                  />
                  <div className="flex gap-2">
                    <select
                      value={channelType}
                      onChange={(event) =>
                        setChannelType(
                          event.target.value as "PUBLIC" | "PRIVATE",
                        )
                      }
                      className="bg-sidebar-accent h-8 min-w-0 flex-1 rounded border px-2 text-xs"
                    >
                      <option value="PUBLIC">Public</option>
                      <option value="PRIVATE">Private</option>
                    </select>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!channelName.trim()}
                    >
                      Create
                    </Button>
                  </div>
                </form>
              )}
              <div className="space-y-0.5">
                {filteredChannels.map((channel) => {
                  const href = `/workspace/${workspaceId}/channels/${channel.id}`;
                  const isActive = pathname === href;
                  const unread = channelUnread[channel.id] ?? 0;
                  return (
                    <Link
                      key={channel.id}
                      href={href}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"}`}
                    >
                      <IconHash className="size-4 shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1 truncate">
                        {channel.name}
                      </span>
                      {unread > 0 && (
                        <Badge
                          variant="secondary"
                          className="h-5 min-w-5 justify-center px-1 text-[11px]"
                        >
                          {unread}
                        </Badge>
                      )}
                    </Link>
                  );
                })}
                {filteredChannels.length === 0 && (
                  <p className="text-sidebar-foreground/60 px-2 text-xs">
                    No channels found.
                  </p>
                )}
              </div>
            </section>

            <section aria-labelledby="direct-messages-heading">
              <div className="flex items-center justify-between px-2 pb-2">
                <h2
                  id="direct-messages-heading"
                  className="text-sidebar-foreground/70 text-xs font-semibold uppercase tracking-wide"
                >
                  Direct messages
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-sidebar-foreground/70 size-6"
                  aria-label="Start a direct message"
                  onClick={async () => {
                    setCreateDMOpen((open) => !open);
                    if (!createDMOpen && dmUsers.length === 0) {
                      try {
                        setDMUsers(await messageService.listDMUsers());
                      } catch {
                        setError("Unable to load people for a direct message.");
                      }
                    }
                  }}
                >
                  <IconPlus className="size-4" />
                </Button>
              </div>
              {createDMOpen && (
                <div className="space-y-1 px-2 pb-2">
                  {dmUsers.map((dmUser) => (
                    <button
                      key={dmUser.id}
                      type="button"
                      className="hover:bg-sidebar-accent flex w-full rounded px-2 py-1.5 text-left text-xs"
                      onClick={() => void openDMUser(dmUser.id)}
                    >
                      <span className="truncate">
                        {dmUser.display_name || dmUser.email}
                      </span>
                    </button>
                  ))}
                  {dmUsers.length === 0 && (
                    <p className="text-sidebar-foreground/60 px-2 text-xs">
                      No people found.
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-0.5">
                {filteredDMs.map((conversation) => {
                  const href = `/workspace/${workspaceId}/dms/${conversation.id}`;
                  const unread = dmUnread[conversation.id] ?? 0;
                  return (
                    <Link
                      key={conversation.id}
                      href={href}
                      className="text-sidebar-foreground/80 hover:bg-sidebar-accent/60 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                    >
                      <IconMessageCircle className="size-4 shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1 truncate">
                        {conversation.other_display_name}
                      </span>
                      {unread > 0 && (
                        <Badge
                          variant="secondary"
                          className="h-5 min-w-5 justify-center px-1 text-[11px]"
                        >
                          {unread}
                        </Badge>
                      )}
                    </Link>
                  );
                })}
                {filteredDMs.length === 0 && (
                  <p className="text-sidebar-foreground/60 px-2 text-xs">
                    No direct messages found.
                  </p>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>

        <div className="border-sidebar-border border-t p-3">
          <Link
            href={`/workspace/${workspaceId}/admin`}
            className="text-sidebar-foreground/80 hover:bg-sidebar-accent/60 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
          >
            <IconSettings className="size-4" />
            <span>Workspace settings</span>
          </Link>
          {error && (
            <p className="text-destructive mt-2 px-2 text-xs">{error}</p>
          )}
          {!currentWorkspace && !error && (
            <p className="text-sidebar-foreground/60 mt-2 px-2 text-xs">
              Loading workspace...
            </p>
          )}
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
