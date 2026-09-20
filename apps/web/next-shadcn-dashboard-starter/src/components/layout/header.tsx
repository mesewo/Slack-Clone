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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { Icons } from "../icons";
import { useParams, usePathname, useRouter } from "next/navigation";

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
      className={`text-sidebar-foreground sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-3 shadow-[0_1px_0_rgba(0,0,0,0.16)] md:px-4 ${isWorkspaceRoute ? "border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)]" : "border-sidebar-border bg-sidebar"}`}
    >
      <div className="relative flex min-w-0 flex-1 items-center justify-center">
        <div className="flex min-w-0 w-[min(100%,48rem)] items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
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
            <SearchInput />
          </div>
        </div>
        <div className="absolute right-0">
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  aria-label="Open help"
                  title="Help"
                />
              }
            >
              <Icons.help className="size-4" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(28rem,92vw)]">
              <SheetHeader>
                <SheetTitle>How to use this workspace</SheetTitle>
                <SheetDescription>
                  Everything you need to find your way around the Slack clone.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 overflow-y-auto px-4 pb-6 text-sm">
                {[
                  ["Home", "Returns to your last channel or direct message."],
                  [
                    "Direct messages",
                    "Browse real DMs, search people, and open a conversation.",
                  ],
                  [
                    "Activity",
                    "Review notifications, mentions, and thread activity in one place.",
                  ],
                  [
                    "Create",
                    "Start a message or channel, invite people, or try coming-soon tools.",
                  ],
                  [
                    "Workspace menu",
                    "Use the avatar at the top of the rail to switch or create workspaces.",
                  ],
                  [
                    "Composer",
                    "Use Aa for formatting, @ for mentions, the paperclip for files, and the arrow for scheduled sending.",
                  ],
                ].map(([title, description]) => (
                  <div key={title}>
                    <p className="font-medium">{title}</p>
                    <p className="text-muted-foreground mt-1">{description}</p>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
