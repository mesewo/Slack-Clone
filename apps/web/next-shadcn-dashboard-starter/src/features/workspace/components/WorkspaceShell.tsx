"use client";

import { useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { IconMenu2 } from "@tabler/icons-react";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WorkspaceConversationSidebar } from "./WorkspaceConversationSidebar";
import { useChatStore } from "@/features/chat/utils/store";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const selectedConversationId = useChatStore(
    (state) => state.selectedConversationId,
  );
  const conversations = useChatStore((state) => state.conversations);

  function closePanel() {
    const selected = conversations.find(
      (conversation) => conversation.id === selectedConversationId,
    );
    if (!selected) {
      router.push(`/home/${workspaceId}`);
      return;
    }
    const conversationPath =
      selected.kind === "dm"
        ? `/home/${workspaceId}/dms/${selected.dmId ?? selected.id.slice(3)}`
        : `/home/${workspaceId}/channels/${selected.id}`;
    router.push(
      pathname === conversationPath
        ? `/home/${workspaceId}`
        : conversationPath,
    );
  }

  return (
    <div className="bg-background relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <aside className="hidden h-full w-72 shrink-0 flex-col border-r border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)] text-sidebar-foreground lg:flex">
        <WorkspaceConversationSidebar />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[min(20rem,88vw)] border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)] p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Workspace navigation</SheetTitle>
            <SheetDescription>Channels and direct messages</SheetDescription>
          </SheetHeader>
          <WorkspaceConversationSidebar />
        </SheetContent>
      </Sheet>
      <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {pathname !== `/home/${workspaceId}` && <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-30 size-8 text-muted-foreground hover:text-foreground"
          aria-label="Close panel"
          title="Close panel"
          onClick={closePanel}
        >
          <Icons.close className="size-4" />
        </Button>}
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
        <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
