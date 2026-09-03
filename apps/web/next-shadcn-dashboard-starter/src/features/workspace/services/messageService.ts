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
  attachments?: UploadedAttachment[];
}

export interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface MessageSearchResult {
  id: string;
  channel_id: string;
  user_id?: string;
  author: string;
  content: string;
  created_at: string;
}

export interface UploadedAttachment {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  url: string;
  thumbnail_url?: string;
}

export const messageService = {
  async search(
    channelId: string,
    query: string,
  ): Promise<MessageSearchResult[]> {
    const res = await apiClient.get<MessageSearchResult[]>(
      "/api/search/messages",
      { params: { q: query, channel_id: channelId } },
    );
    return res.data;
  },

  async upload(file: File): Promise<UploadedAttachment> {
    const form = new FormData();
    form.append("file", file);
    const res = await apiClient.post<UploadedAttachment>("/api/uploads", form);
    return res.data;
  },

  async send(
    channelId: string,
    content: string,
    attachmentIds: string[] = [],
  ): Promise<ChatMessage> {
    const res = await apiClient.post<ChatMessage>(
      `/api/channels/${channelId}/messages`,
      { content, attachment_ids: attachmentIds },
    );
    return res.data;
  },

  async edit(
    channelId: string,
    messageId: string,
    content: string,
  ): Promise<ChatMessage> {
    const res = await apiClient.patch<ChatMessage>(
      `/api/channels/${channelId}/messages/${messageId}`,
      { content },
    );
    return res.data;
  },

  async delete(channelId: string, messageId: string): Promise<void> {
    await apiClient.delete(`/api/channels/${channelId}/messages/${messageId}`);
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

  async listReactions(
    channelId: string,
    messageId: string,
  ): Promise<MessageReaction[]> {
    const res = await apiClient.get<MessageReaction[]>(
      `/api/channels/${channelId}/messages/${messageId}/reactions`,
    );
    return res.data ?? [];
  },

  async listThreadReplies(
    channelId: string,
    parentMessageId: string,
  ): Promise<ChatMessage[]> {
    const res = await apiClient.get<ChatMessage[]>(
      `/api/channels/${channelId}/messages/${parentMessageId}/replies`,
    );
    return res.data;
  },

  async createThreadReply(
    channelId: string,
    messageId: string,
    content: string,
  ): Promise<ChatMessage> {
    const res = await apiClient.post<ChatMessage>(
      `/api/channels/${channelId}/messages/${messageId}/replies`,
      { content },
    );
    return res.data;
  },

  async addReaction(
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    await apiClient.post(
      `/api/channels/${channelId}/messages/${messageId}/reactions`,
      { emoji },
    );
  },

  async removeReaction(channelId: string, messageId: string): Promise<void> {
    await apiClient.delete(
      `/api/channels/${channelId}/messages/${messageId}/reactions`,
    );
  },
};
