import { apiClient } from "@/lib/axios";

export interface ChatMessage {
  id: string;
  channel_id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  parent_id: string | null;
  reply_count: number;
  author_name?: string | null;
}

export const messageService = {
  async send(channelId: string, content: string): Promise<ChatMessage> {
    const res = await apiClient.post<ChatMessage>(
      `/api/channels/${channelId}/messages`,
      { content },
    );
    return res.data;
  },

  async list(
    channelId: string,
    opts?: { before?: string; limit?: number },
  ): Promise<ChatMessage[]> {
    const res = await apiClient.get<ChatMessage[]>(
      `/api/channels/${channelId}/messages`,
      { params: opts },
    );
    return res.data;
  },
};
