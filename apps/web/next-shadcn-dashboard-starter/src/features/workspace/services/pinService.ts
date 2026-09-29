import { apiClient } from "@/lib/axios";

export interface PinnedMessage {
  id: string;
  message_id: string;
  channel_id?: string;
  conversation_id?: string;
  content: string;
  pinned_by_name: string;
  created_at: string;
  message_created_at: string;
}

export type PinScope = { channel_id: string } | { conversation_id: string };

const scopeQuery = (scope: PinScope) => new URLSearchParams(scope).toString();

export const pinService = {
  list: async (scope: PinScope) => {
    const items = (await apiClient.get<PinnedMessage[] | null>(`/api/pinned-messages?${scopeQuery(scope)}`)).data;
    return Array.isArray(items) ? items : [];
  },
  pin: async (messageId: string, scope: PinScope) => {
    await apiClient.post(`/api/pinned-messages/${messageId}?${scopeQuery(scope)}`);
  },
  unpin: async (messageId: string, scope: PinScope) => {
    await apiClient.delete(`/api/pinned-messages/${messageId}?${scopeQuery(scope)}`);
  },
};
