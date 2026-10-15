import { apiClient } from "@/lib/axios";

export interface ProfileSettings {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string;
  presence_status: string;
}

export interface NotificationPreferences {
  mentions: boolean;
  direct_messages: boolean;
  thread_replies: boolean;
  reactions: boolean;
}

export interface SavedMessage {
  message_id: string;
  channel_id?: string;
  conversation_id?: string;
  content: string;
  created_at: string;
}

export const productivityService = {
  getProfile: async () =>
    (await apiClient.get<ProfileSettings>("/api/profile")).data,
  updateProfile: async (
    data: Partial<
      Pick<ProfileSettings, "display_name" | "avatar_url" | "presence_status">
    >,
  ) => (await apiClient.patch<ProfileSettings>("/api/profile", data)).data,
  listSavedMessages: async () =>
    (await apiClient.get<SavedMessage[]>("/api/saved-messages")).data,
  saveMessage: async (messageId: string) => {
    await apiClient.post(`/api/saved-messages/${messageId}`);
  },
  unsaveMessage: async (messageId: string) => {
    await apiClient.delete(`/api/saved-messages/${messageId}`);
  },
  subscribeThread: async (messageId: string) => {
    await apiClient.post(`/api/messages/${messageId}/thread-subscription`);
  },
  unsubscribeThread: async (messageId: string) => {
    await apiClient.delete(`/api/messages/${messageId}/thread-subscription`);
  },
  getNotificationPreferences: async () =>
    (
      await apiClient.get<NotificationPreferences>(
        "/api/notification-preferences",
      )
    ).data,
  updateNotificationPreferences: async (data: NotificationPreferences) =>
    (
      await apiClient.patch<NotificationPreferences>(
        "/api/notification-preferences",
        data,
      )
    ).data,
  scheduleMessage: async (data: {
    channel_id?: string;
    conversation_id?: string;
    content: string;
    scheduled_for: string;
  }) => (await apiClient.post("/api/scheduled-messages", data)).data,
};
