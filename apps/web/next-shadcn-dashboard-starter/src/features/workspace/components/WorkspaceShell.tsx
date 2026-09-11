"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { IconMenu2, IconSettings } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WorkspaceConversationSidebar } from "./WorkspaceConversationSidebar";
import { WorkspacePanelSystem } from "./WorkspacePanelSystem";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="bg-background relative flex min-h-full min-w-0 flex-1">
      <aside className="bg-sidebar text-sidebar-foreground hidden w-72 shrink-0 flex-col border-r lg:flex">
        <WorkspaceConversationSidebar />
        <div className="border-sidebar-border border-t p-3">
          <Link
            href={`/workspace/${workspaceId}/admin`}
            className="text-sidebar-foreground/80 hover:bg-sidebar-accent/60 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150"
          >
            <IconSettings className="size-4" />
            <span>Workspace settings</span>
          </Link>
        </div>
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[min(20rem,88vw)] bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Workspace navigation</SheetTitle>
            <SheetDescription>Channels and direct messages</SheetDescription>
          </SheetHeader>
          <WorkspaceConversationSidebar />
        </SheetContent>
      </Sheet>
      <main className="relative min-w-0 flex-1 pt-12 lg:pt-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute left-2 top-2 z-20 lg:hidden"
          aria-label="Open workspace navigation"
          onClick={() => setMobileOpen(true)}
        >
          <IconMenu2 className="size-5" />
        </Button>
        {children}
      </main>
      <WorkspacePanelSystem />
    </div>
  );
}
