"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  IconActivity,
  IconBookmark,
  IconMessageCircle,
} from "@tabler/icons-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useNotificationStore } from "@/features/notifications/utils/store";
import {
  messageService,
  type ThreadSummary,
} from "@/features/workspace/services/messageService";
import {
  productivityService,
  type SavedMessage,
} from "@/features/workspace/services/productivityService";

type Panel = "threads" | "activity" | "saved" | null;

function PanelButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="icon"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}

export function WorkspacePanelSystem() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [saved, setSaved] = useState<SavedMessage[]>([]);
  const {
    notifications,
    load: loadNotifications,
    markAsRead,
  } = useNotificationStore();

  useEffect(() => {
    if (panel === "threads")
      void messageService
        .listThreads()
        .then(setThreads)
        .catch(() => setThreads([]));
    if (panel === "saved")
      void productivityService
        .listSavedMessages()
        .then(setSaved)
        .catch(() => setSaved([]));
    if (panel === "activity") void loadNotifications();
  }, [loadNotifications, panel]);

  function openThread(thread: ThreadSummary) {
    setPanel(null);
    router.push(
      thread.kind === "dm"
        ? `/workspace/${workspaceId}/dms/${thread.conversation_id}`
        : `/workspace/${workspaceId}/channels/${thread.channel_id}`,
    );
  }

  async function unsave(messageId: string) {
    setSaved((current) =>
      current.filter((item) => item.message_id !== messageId),
    );
    try {
      await productivityService.unsaveMessage(messageId);
    } catch {
      setSaved(await productivityService.listSavedMessages().catch(() => []));
    }
  }

  return (
    <>
      <div className="fixed right-3 top-20 z-40 flex flex-col gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur">
        <PanelButton
          label="Threads"
          icon={<IconMessageCircle className="size-4" />}
          active={panel === "threads"}
          onClick={() => setPanel("threads")}
        />
        <PanelButton
          label="Activity"
          icon={<IconActivity className="size-4" />}
          active={panel === "activity"}
          onClick={() => setPanel("activity")}
        />
        <PanelButton
          label="Saved items"
          icon={<IconBookmark className="size-4" />}
          active={panel === "saved"}
          onClick={() => setPanel("saved")}
        />
      </div>
      <Sheet
        open={panel !== null}
        onOpenChange={(open) => !open && setPanel(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {panel === "threads"
                ? "Threads"
                : panel === "activity"
                  ? "Activity"
                  : "Saved items"}
            </SheetTitle>
            <SheetDescription>
              {panel === "threads"
                ? "Threads you joined or follow"
                : panel === "activity"
                  ? "Mentions, reactions, and thread activity"
                  : "Messages saved for later"}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {panel === "threads" &&
              (threads.length ? (
                threads.map((thread) => (
                  <button
                    key={`${thread.kind}-${thread.id}`}
                    type="button"
                    onClick={() => openThread(thread)}
                    className="border-border hover:bg-muted mb-2 block w-full rounded-lg border p-3 text-left"
                  >
                    <p className="text-xs font-semibold">{thread.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm">
                      {thread.preview}
                    </p>
                    <p className="text-muted-foreground mt-2 text-xs">
                      {thread.reply_count} replies
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">No threads yet.</p>
              ))}
            {panel === "activity" &&
              (notifications.length ? (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      markAsRead(item.id);
                      setPanel(null);
                    }}
                    className="border-border hover:bg-muted mb-2 block w-full rounded-lg border p-3 text-left"
                  >
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm">{item.body}</p>
                    <p className="text-muted-foreground mt-2 text-xs">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  No activity yet.
                </p>
              ))}
            {panel === "saved" &&
              (saved.length ? (
                saved.map((item) => (
                  <div
                    key={item.message_id}
                    className="border-border mb-2 flex items-start gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap text-sm">
                        {item.content}
                      </p>
                      <p className="text-muted-foreground mt-2 text-xs">
                        Saved {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void unsave(item.message_id)}
                    >
                      Unsave
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nothing saved yet.
                </p>
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
