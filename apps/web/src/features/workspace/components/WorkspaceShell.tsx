"use client";

import { useEffect, useState } from "react";
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
import { NewMessageComposer } from "@/features/chat/components/new-message-composer";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const CHAT_LIST_WIDTH_KEY = "slack_chatlist_width";
type DownloadProgressItem = { id: string; filename: string; status: "downloading" | "complete" | "failed"; progress: number };

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [newMessagePath, setNewMessagePath] = useState<string | null>(null);
  const [chatListWidth, setChatListWidth] = useState(24);
  const [chatListWidthLoaded, setChatListWidthLoaded] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressItem[]>([]);
  const [downloadPanelDismissed, setDownloadPanelDismissed] = useState(false);
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const selectedConversationId = useChatStore(
    (state) => state.selectedConversationId,
  );
  const conversations = useChatStore((state) => state.conversations);
  const newMessageOpen = newMessagePath === pathname;

  useEffect(() => {
    setNewMessagePath(null);
  }, [pathname]);

  useEffect(() => {
    try {
      const savedWidth = Number(window.localStorage.getItem(CHAT_LIST_WIDTH_KEY));
      if (Number.isFinite(savedWidth) && savedWidth >= 18 && savedWidth <= 35) {
        setChatListWidth(savedWidth);
      }
    } catch {
      // Keep the default width when storage is unavailable.
    }
    setChatListWidthLoaded(true);
  }, []);

  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<DownloadProgressItem>).detail;
      if (!detail?.id) return;
      setDownloadPanelDismissed(false);
      setDownloadProgress((current) => {
        const next = [...current.filter((item) => item.id !== detail.id), detail];
        return next.slice(-6);
      });
      if (detail.status !== "downloading") {
        window.setTimeout(() => setDownloadProgress((current) => current.filter((item) => item.id !== detail.id)), 2400);
      }
    };
    window.addEventListener("workspace:download-progress", onProgress);
    return () => window.removeEventListener("workspace:download-progress", onProgress);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktopLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onWorkspaceShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) return;

      const key = event.key.toLowerCase();
      const destinations: Record<string, string> = {
        "1": `/home/${workspaceId}`,
        "2": `/home/${workspaceId}?dmOnly=1`,
        m: `/home/${workspaceId}/activity`,
        t: `/home/${workspaceId}/threads`,
        e: `/home/${workspaceId}/directories`,
        l: `/home/${workspaceId}/directories?tab=Channels`,
      };
      const destination = destinations[key];
      if (!destination) return;
      event.preventDefault();
      setNewMessagePath(null);
      router.push(destination);
    };
    window.addEventListener("keydown", onWorkspaceShortcut);
    return () => window.removeEventListener("keydown", onWorkspaceShortcut);
  }, [router, workspaceId]);

  const openNewMessage = () => {
    setMobileOpen(false);
    setNewMessagePath(pathname);
  };
  const closeNewMessage = () => setNewMessagePath(null);

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
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 bg-[var(--chat-sidebar-bg)] pr-1 pb-1">
      <div className="bg-background relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--chat-sidebar-border)]">
      <ResizablePanelGroup
        key={`${chatListWidthLoaded ? "stored" : "default"}-${isDesktopLayout ? "desktop" : "mobile"}`}
        orientation="horizontal"
        className="min-h-0 min-w-0 flex-1"
        defaultLayout={{ chatList: isDesktopLayout ? chatListWidth : 0, main: isDesktopLayout ? 100 - chatListWidth : 100 }}
        resizeTargetMinimumSize={{ fine: 16, coarse: 24 }}
        onLayoutChanged={(layout, meta) => {
          const width = layout.chatList;
          if (meta.isUserInteraction && isDesktopLayout && typeof width === "number" && Number.isFinite(width)) {
            setChatListWidth(width);
            try {
              window.localStorage.setItem(CHAT_LIST_WIDTH_KEY, String(width));
            } catch {
              // Resizing still works if storage is unavailable.
            }
          }
        }}
      >
        <ResizablePanel
          id="chatList"
          defaultSize={isDesktopLayout ? `${chatListWidth}%` : "0%"}
          minSize={isDesktopLayout ? "18%" : "0%"}
          maxSize={isDesktopLayout ? "35%" : "0%"}
          collapsible
          collapsedSize="0%"
          className={`min-h-0 min-w-0 ${isDesktopLayout ? "" : "hidden"}`}
        >
          <aside className="flex h-full min-h-0 min-w-0 flex-col border-r border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)] text-sidebar-foreground">
            <WorkspaceConversationSidebar
              onNewMessage={openNewMessage}
              onBeforeNavigate={closeNewMessage}
            />
          </aside>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="group/resize z-10 hidden w-2 cursor-col-resize border-0 bg-transparent hover:bg-transparent lg:flex [&>div]:opacity-0 [&>div]:transition-opacity group-hover/resize:[&>div]:opacity-100"
        />
        <ResizablePanel
          id="main"
          defaultSize={isDesktopLayout ? `${100 - chatListWidth}%` : "100%"}
          minSize={isDesktopLayout ? "65%" : "100%"}
          className="min-h-0 min-w-0"
        >
          <main className="relative flex h-full min-h-0 min-w-0 overflow-hidden">
            {pathname !== `/home/${workspaceId}` && !newMessageOpen && <Button
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
            <div className="flex min-h-0 min-w-0 flex-1">
              {newMessageOpen ? (
                <NewMessageComposer
                  conversations={conversations}
                  onClose={() => setNewMessagePath(null)}
                />
              ) : (
                children
              )}
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[min(20rem,88vw)] border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)] p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Workspace navigation</SheetTitle>
            <SheetDescription>Channels and direct messages</SheetDescription>
          </SheetHeader>
          <WorkspaceConversationSidebar
            onNewMessage={openNewMessage}
            onBeforeNavigate={closeNewMessage}
          />
        </SheetContent>
      </Sheet>
      {downloadProgress.length > 0 && !downloadPanelDismissed && <section aria-label="File downloads" aria-live="polite" className="absolute right-5 bottom-5 z-50 w-[min(22rem,calc(100%-2rem))] rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Downloads</h2><button type="button" onClick={() => setDownloadPanelDismissed(true)} aria-label="Dismiss download progress" className="text-muted-foreground rounded px-2 py-1 text-xs hover:bg-muted">Hide</button></div>
        <div className="space-y-3">{downloadProgress.map((item) => <div key={item.id} className="min-w-0"><div className="mb-1 flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate">{item.filename}</span><span className="text-muted-foreground shrink-0">{item.status === "downloading" ? `${item.progress}%` : item.status === "complete" ? "Done" : "Failed"}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-[width] ${item.status === "failed" ? "bg-destructive" : "bg-primary"} ${item.progress === 0 && item.status === "downloading" ? "w-1/4 animate-pulse" : ""}`} style={{ width: item.progress > 0 ? `${item.progress}%` : undefined }} /></div></div>)}</div>
      </section>}
      </div>
    </div>
  );
}
