"use client";

import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { NotificationCard } from "@/components/ui/notification-card";
import { useNotificationStore } from "../utils/store";
import { useEffect, useState } from "react";
import { useChatStore } from "@/features/chat/utils/store";

const MAX_VISIBLE = 5;

export function NotificationCenter() {
  const { notifications, load, markAsRead, markAllAsRead, unreadCount } =
    useNotificationStore();
  const markEntityAsRead = useNotificationStore(
    (state) => state.markEntityAsRead,
  );
  useEffect(() => {
    void load();
  }, [load]);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const conversations = useChatStore((state) => state.conversations);
  const selectedConversationId = useChatStore(
    (state) => state.selectedConversationId,
  );
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  const selectedConversationUnread = selectedConversation?.unread ?? 0;
  const [open, setOpen] = useState(false);
  const count = unreadCount();
  const visibleNotifications = notifications
    .filter((notification) => notification.status === "unread")
    .slice(0, MAX_VISIBLE);

  useEffect(() => {
    if (selectedConversation && selectedConversationUnread === 0) {
      markEntityAsRead(selectedConversation.id);
    }
  }, [markEntityAsRead, selectedConversation?.id, selectedConversationUnread]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative h-8 w-8" />
        }
      >
        <Icons.notification className="h-4 w-4" />
        {count > 0 && (
          <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium">
            {count > 9 ? "9+" : count}
          </span>
        )}
        <span className="sr-only">Notifications</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[calc(100vw-2rem)] p-0 sm:w-[380px]"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Unread activity</h4>
            <button
              type="button"
              onClick={() =>
                document.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "Escape" }),
                )
              }
              className="text-muted-foreground hover:bg-accent rounded p-1"
              aria-label="Close notifications"
            >
              <Icons.close className="size-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {count > 0 && (
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                {count} new
              </span>
            )}
            {count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-auto px-2 py-1 text-xs"
                onClick={markAllAsRead}
              >
                Mark all as read
              </Button>
            )}
          </div>
        </div>
        <Separator />
        <ScrollArea className="h-[400px]">
          {visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Icons.notification className="text-muted-foreground/40 mb-2 h-8 w-8" />
              <p className="text-muted-foreground text-sm">
                No notifications yet
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 p-2">
              {visibleNotifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  id={notification.id}
                  title={notification.title}
                  body={notification.body}
                  status={notification.status}
                  createdAt={notification.createdAt}
                  actions={notification.actions}
                  onMarkAsRead={markAsRead}
                  onAction={(notifId, actionId) => {
                    if (actionId === "open-chat") {
                      markAsRead(notifId);
                      const notification = notifications.find(
                        (item) => item.id === notifId,
                      );
                      if (notification?.entityId) {
                        const conversationId = notification.title.includes(
                          "direct",
                        )
                          ? `dm:${notification.entityId}`
                          : notification.entityId;
                        window.localStorage.setItem(
                          "slack_last_conversation_id",
                          conversationId,
                        );
                        if (
                          conversations.some(
                            (conversation) =>
                              conversation.id === conversationId,
                          )
                        ) {
                          selectConversation(conversationId);
                          setOpen(false);
                          return;
                        }
                      }
                      setOpen(false);
                      const workspaceId = window.localStorage.getItem(
                        "active_workspace_id",
                      );
                      if (workspaceId && notification?.entityId) {
                        const target = notification.title.includes("direct")
                          ? `/workspace/${workspaceId}/dms/${notification.entityId}`
                          : `/workspace/${workspaceId}/channels/${notification.entityId}`;
                        window.location.assign(target);
                      } else {
                        window.location.assign("/dashboard/workspaces");
                      }
                    }
                  }}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
