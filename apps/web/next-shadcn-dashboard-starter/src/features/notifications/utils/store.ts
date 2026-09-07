import { create } from "zustand";
import type {
  NotificationStatus,
  NotificationAction,
} from "@/components/ui/notification-card";
import { apiClient } from "@/lib/axios";

export type Notification = {
  id: string;
  title: string;
  body: string;
  status: NotificationStatus;
  createdAt: string;
  actions?: NotificationAction[];
};

type NotificationState = {
  notifications: Notification[];
  load: () => Promise<void>;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  addNotification: (notification: Omit<Notification, "status">) => void;
  unreadCount: () => number;
};

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  load: async () => {
    try {
      const response = await apiClient.get<
        Array<{
          id: string;
          title: string;
          body: string;
          action?: string;
          created_at: string;
          read_at?: string | null;
        }>
      >("/api/notifications");
      set({
        notifications: response.data.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          status: item.read_at ? "read" : "unread",
          createdAt: item.created_at,
          actions: item.action
            ? [
                {
                  id: item.action,
                  label: "Open",
                  type: "redirect",
                  style: "primary",
                },
              ]
            : undefined,
        })),
      });
    } catch {
      set({ notifications: [] });
    }
  },

  markAsRead: (id) => {
    void apiClient.post(`/api/notifications/${id}/read`).catch(() => undefined);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, status: "read" as const } : n,
      ),
    }));
  },

  markAllAsRead: () => {
    void apiClient.post("/api/notifications/read-all").catch(() => undefined);
    set((state) => ({
      notifications: state.notifications.map((n) => ({
        ...n,
        status: "read" as const,
      })),
    }));
  },

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        { ...notification, status: "unread" as const },
        ...state.notifications,
      ],
    })),

  unreadCount: () =>
    get().notifications.filter((n) => n.status === "unread").length,
}));
