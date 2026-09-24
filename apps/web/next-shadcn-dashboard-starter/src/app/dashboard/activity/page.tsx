"use client";

import { useEffect, useMemo, useState } from "react";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  messageService,
  type ThreadSummary,
} from "@/features/workspace/services/messageService";
import {
  useNotificationStore,
  type Notification,
} from "@/features/notifications/utils/store";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Tab = "all" | "dms" | "mentions" | "threads";

export default function ActivityPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [selected, setSelected] = useState<Notification | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { notifications, load, markAsRead, markAllAsRead } =
    useNotificationStore();

  useEffect(() => {
    void load();
    void messageService
      .listThreads()
      .then(setThreads)
      .catch(() => setThreads([]));
  }, [load]);

  const filteredNotifications = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return notifications.filter((item) => {
      if (unreadOnly && item.status !== "unread") return false;
      if (tab === "dms" && !item.title.toLowerCase().includes("direct"))
        return false;
      if (tab === "mentions" && !item.title.toLowerCase().includes("mention"))
        return false;
      if (
        normalized &&
        !`${item.title} ${item.body}`.toLowerCase().includes(normalized)
      )
        return false;
      return true;
    });
  }, [notifications, query, tab, unreadOnly]);

  const isThreads = tab === "threads";
  const allCount = notifications.length + threads.length;
  const hasItems = isThreads
    ? threads.length > 0
    : filteredNotifications.length > 0;

  const openNotification = (notification: Notification) => {
    markAsRead(notification.id);
    const workspaceId = window.localStorage.getItem("active_workspace_id");
    if (!workspaceId || !notification.entityId) return;
    router.push(
      notification.title.toLowerCase().includes("direct")
        ? `/home/${workspaceId}/dms/${notification.entityId}`
        : `/home/${workspaceId}/channels/${notification.entityId}`,
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="border-border/70 shrink-0 border-b px-5 py-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sidebar-primary text-xs font-semibold tracking-[0.18em] uppercase">
              Workspace activity
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Activity</h1>
          </div>
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            Mark all as read
          </Button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {(["all", "dms", "mentions", "threads"] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`rounded-full px-3 py-1.5 text-sm capitalize transition-colors ${tab === value ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-accent"}`}
            >
              {value === "all"
                ? `All (${allCount})`
                : value === "threads"
                  ? `Threads (${threads.length})`
                  : value}
            </button>
          ))}
          <button
            type="button"
            onClick={() => toast.info("Custom activity tabs are coming soon.")}
            className="text-muted-foreground hover:bg-accent rounded-full px-3 py-1.5 text-sm"
          >
            +
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant={unreadOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => setUnreadOnly((value) => !value)}
          >
            {unreadOnly ? "Showing unread" : "Unreads"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Activity filters"
            onClick={() =>
              toast.info("Advanced activity filters are coming soon.")
            }
          >
            <Icons.adjustments className="size-4" />
          </Button>
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Icons.search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search activity"
              className="pl-8"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Compact activity view"
            onClick={() => toast.info("Compact view is coming soon.")}
          >
            <Icons.dots className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
        <section
          className="border-border/70 min-h-0 overflow-y-auto border-b lg:border-r lg:border-b-0"
          aria-label="Activity list"
        >
          {!hasItems ? (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <Icons.circleCheck className="text-sidebar-primary size-10" />
              <p className="text-sm">All caught up</p>
              <p className="text-xs">There is nothing new here.</p>
            </div>
          ) : isThreads ? (
            <div className="divide-border/70 divide-y">
              {threads.map((thread) => (
                <button
                  key={`${thread.kind}-${thread.id}`}
                  type="button"
                  onClick={() => {
                    const workspaceId = window.localStorage.getItem(
                      "active_workspace_id",
                    );
                    if (!workspaceId) {
                      toast.info("Open a workspace first.");
                      return;
                    }
                    router.push(
                      thread.kind === "dm"
                        ? `/home/${workspaceId}/dms/${thread.conversation_id}`
                        : `/home/${workspaceId}/channels/${thread.channel_id}`,
                    );
                  }}
                  className="hover:bg-accent/40 w-full p-4 text-left"
                >
                  <p className="text-sm font-medium">{thread.title}</p>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                    {thread.preview}
                  </p>
                  <p className="text-muted-foreground mt-2 text-[0.7rem]">
                    {thread.reply_count} replies
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="divide-border/70 divide-y">
              {filteredNotifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelected(item);
                    openNotification(item);
                  }}
                  className={`hover:bg-accent/40 w-full p-4 text-left ${selected?.id === item.id ? "bg-accent/30" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1 size-2 rounded-full ${item.status === "unread" ? "bg-sidebar-primary" : "bg-muted"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                        {item.body}
                      </p>
                      <p className="text-muted-foreground mt-2 text-[0.7rem]">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
        <section
          className="hidden min-h-0 overflow-y-auto p-8 lg:block"
          aria-label="Activity details"
        >
          {selected ? (
            <div className="max-w-xl">
              <p className="text-sidebar-primary text-xs font-semibold tracking-[0.16em] uppercase">
                Notification detail
              </p>
              <h2 className="mt-2 text-xl font-semibold">{selected.title}</h2>
              <p className="text-muted-foreground mt-4 whitespace-pre-wrap text-sm">
                {selected.body}
              </p>
              <p className="text-muted-foreground mt-6 text-xs">
                {new Date(selected.createdAt).toLocaleString()}
              </p>
            </div>
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              Select a notification to view the details
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
