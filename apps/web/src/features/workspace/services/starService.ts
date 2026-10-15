import { apiClient } from "@/lib/axios";

export interface StarredConversation {
  id: string;
  channel_id?: string;
  conversation_id?: string;
  created_at: string;
}

export const starService = {
  list: async () => {
    const items = (await apiClient.get<StarredConversation[] | null>("/api/starred-conversations")).data;
    return Array.isArray(items) ? items : [];
  },
  star: async (kind: "channel" | "dm", id: string) => {
    await apiClient.post(`/api/starred-conversations/${kind}/${id}`);
  },
  unstar: async (kind: "channel" | "dm", id: string) => {
    await apiClient.delete(`/api/starred-conversations/${kind}/${id}`);
  },
};
