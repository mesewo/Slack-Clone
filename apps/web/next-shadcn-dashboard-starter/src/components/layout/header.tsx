"use client";

import React from "react";
import SearchInput from "../search-input";
import { Button } from "../ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { Icons } from "../icons";

export default function Header() {
  return (
    <header className="bg-sidebar text-sidebar-foreground sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3 shadow-[0_1px_0_rgba(0,0,0,0.16)] md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="min-w-0 max-w-2xl flex-1">
          <SearchInput />
        </div>
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
        <Sheet>
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto size-8 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
    </header>
  );
}
