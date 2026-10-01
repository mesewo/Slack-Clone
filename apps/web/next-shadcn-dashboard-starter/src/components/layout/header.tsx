"use client";

import React, { useEffect, useState } from "react";
import SearchInput from "../search-input";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Icons } from "../icons";
import { SidebarTrigger } from "../ui/sidebar";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type NavigationHistoryEntry = {
  id: string;
  kind: "channel" | "dm";
  label: string;
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const isWorkspaceRoute = pathname.startsWith("/home");
  const [history, setHistory] = useState<NavigationHistoryEntry[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    try {
      setHistory(
        JSON.parse(
          window.localStorage.getItem(
            `slack_navigation_history:${workspaceId}`,
          ) || "[]",
        ) as NavigationHistoryEntry[],
      );
    } catch {
      setHistory([]);
    }
  }, [pathname, workspaceId]);
  return (
    <header
      className={`text-sidebar-foreground sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 px-3 md:px-4 ${isWorkspaceRoute ? "bg-[var(--chat-sidebar-bg)]" : "border-b border-sidebar-border bg-sidebar shadow-[0_1px_0_rgba(0,0,0,0.16)]"}`}
    >
      <div className="relative flex min-w-0 flex-1 items-center justify-center">
        <div className="flex min-w-0 w-[min(100%,48rem)] items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
            <SidebarTrigger className="size-8 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => window.history.back()}
              aria-label="Go back"
              title="Go back"
            >
              <Icons.chevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => window.history.forward()}
              aria-label="Go forward"
              title="Go forward"
            >
              <Icons.chevronRight className="size-4" />
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  aria-label="Open navigation history"
                  title="Navigation history"
                />
              }
            >
              <Icons.clock className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Recent navigation</DropdownMenuLabel>
              </DropdownMenuGroup>
              {history.length > 0 ? (
                history.map((entry) => (
                  <DropdownMenuItem
                    key={`${entry.kind}:${entry.id}`}
                    onClick={() =>
                      router.push(
                        entry.kind === "dm"
                          ? `/home/${workspaceId}/dms/${entry.id.slice(3)}`
                          : `/home/${workspaceId}/channels/${entry.id}`,
                      )
                    }
                  >
                    {entry.kind === "channel" ? (
                      <span className="mr-2 w-4 text-center font-semibold">
                        #
                      </span>
                    ) : (
                      <Icons.profile className="mr-2 size-4" />
                    )}
                    <span className="truncate">{entry.label}</span>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>
                  No recent navigation
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="min-w-0 flex-1">
            <SearchInput workspaceMode={isWorkspaceRoute} />
          </div>
        </div>
        <div className="absolute right-0">
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  aria-label="About Slack Clone"
                  title="About Slack Clone"
                />
              }
            >
              <Icons.help className="size-4" />
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-80 p-4 shadow-[var(--shadow-menu)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Slack Clone</h2>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    An independent team collaboration app inspired by Slack.
                    Built around channels, direct messages, and real-time teamwork.
                  </p>
                </div>
                <a
                  href="https://github.com/mesewo/slack-clone"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View project on GitHub"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <Icons.externalLink className="size-4" />
                </a>
              </div>
              <div className="mt-3">
                <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">Built with</h3>
                <p className="mt-1 text-xs">Next.js · Go · PostgreSQL · Kafka · WebSocket</p>
              </div>
              <div className="mt-3">
                <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">Features</h3>
                <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <li>Real-time messaging</li>
                  <li>Threads and replies</li>
                  <li>Reactions and saves</li>
                  <li>Scheduled messages</li>
                  <li>Starred and pinned items</li>
                </ul>
              </div>
              <a
                href="https://github.com/mesewo/slack-clone"
                target="_blank"
                rel="noreferrer"
                className="text-primary mt-4 inline-flex items-center gap-1 text-xs font-medium hover:underline"
              >
                GitHub repository <Icons.externalLink className="size-3" />
              </a>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
