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

export interface ThreadSummary {
  id: string;
  kind: "channel" | "dm";
  channel_id?: string;
  conversation_id?: string;
  title: string;
  preview: string;
  reply_count: number;
  last_activity: string;
}

export interface UploadedAttachment {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  url: string;
  thumbnail_url?: string;
}

export interface DirectConversation {
  id: string;
  other_user_id: string;
  other_display_name: string;
  other_email: string;
  other_presence_status?: string;
}

export interface DirectUser {
  id: string;
  email: string;
  display_name: string;
}

export const messageService = {
  async listThreads(): Promise<ThreadSummary[]> {
    const res = await apiClient.get<ThreadSummary[]>("/api/threads");
    return res.data ?? [];
  },
  async listDMs(): Promise<DirectConversation[]> {
    const res = await apiClient.get<DirectConversation[]>("/api/dms");
    return res.data ?? [];
  },
  async createSelfDM(): Promise<{ id: string }> {
    const res = await apiClient.post<{ id: string }>("/api/dms/self");
    return res.data;
  },

  async listDMUsers(): Promise<DirectUser[]> {
    const res = await apiClient.get<DirectUser[]>("/api/dms/users");
    return res.data ?? [];
  },

  async createDM(userId: string): Promise<{ id: string }> {
    const res = await apiClient.post<{ id: string }>("/api/dms", {
      user_id: userId,
    });
    return res.data;
  },

  async listDMMessages(conversationId: string): Promise<ChatMessage[]> {
    const res = await apiClient.get<ChatMessage[]>(
      `/api/dms/${conversationId}/messages`,
    );
    return res.data ?? [];
  },
  async listDMMessagesPage(
    conversationId: string,
    opts?: { before?: string; limit?: number },
  ): Promise<ChatMessage[]> {
    const res = await apiClient.get<ChatMessage[]>(
      `/api/dms/${conversationId}/messages`,
      { params: opts },
    );
    return res.data ?? [];
  },
  async markChannelRead(channelId: string): Promise<void> {
    await apiClient.post(`/api/channels/${channelId}/read`);
  },
  async getChannelUnread(channelId: string): Promise<number> {
    const res = await apiClient.get<{ unread: number }>(
      `/api/channels/${channelId}/unread`,
    );
    return res.data.unread;
  },
  async markDMRead(conversationId: string): Promise<void> {
    await apiClient.post(`/api/dms/${conversationId}/read`);
  },
  async getDMUnread(conversationId: string): Promise<number> {
    const res = await apiClient.get<{ unread: number }>(
      `/api/dms/${conversationId}/unread`,
    );
    return res.data.unread;
  },

  async sendDM(
    conversationId: string,
    content: string,
    attachmentIds: string[] = [],
  ): Promise<ChatMessage> {
    const res = await apiClient.post<ChatMessage>(
      `/api/dms/${conversationId}/messages`,
      { content, attachment_ids: attachmentIds },
    );
    return res.data;
  },
  async searchDM(
    conversationId: string,
    query: string,
  ): Promise<MessageSearchResult[]> {
    const res = await apiClient.get<MessageSearchResult[]>(
      `/api/dms/${conversationId}/search`,
      { params: { q: query } },
    );
    return res.data;
  },
  async listDMReactions(
    conversationId: string,
    messageId: string,
  ): Promise<MessageReaction[]> {
    const res = await apiClient.get<MessageReaction[]>(
      `/api/dms/${conversationId}/messages/${messageId}/reactions`,
    );
    return res.data ?? [];
  },
  async addDMReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    await apiClient.post(
      `/api/dms/${conversationId}/messages/${messageId}/reactions`,
      { emoji },
    );
  },
  async removeDMReaction(
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    await apiClient.delete(
      `/api/dms/${conversationId}/messages/${messageId}/reactions`,
    );
  },
  async listDMThreadReplies(
    conversationId: string,
    messageId: string,
  ): Promise<ChatMessage[]> {
    const res = await apiClient.get<ChatMessage[]>(
      `/api/dms/${conversationId}/messages/${messageId}/replies`,
    );
    return res.data;
  },
  async createDMThreadReply(
    conversationId: string,
    messageId: string,
    content: string,
  ): Promise<ChatMessage> {
    const res = await apiClient.post<ChatMessage>(
      `/api/dms/${conversationId}/messages/${messageId}/replies`,
      { content },
    );
    return res.data;
  },
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
    try {
      const presign = await apiClient.post<{
        session_id: string;
        upload_url: string;
        filename: string;
        content_type: string;
        size_bytes: number;
      }>("/api/uploads/presign", {
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      });

      const uploadURL = presign.data.upload_url;
      const putResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });
      if (!putResponse.ok) {
        throw new Error(`upload PUT failed: ${putResponse.status}`);
      }

      const complete = await apiClient.post<UploadedAttachment>(
        "/api/uploads/complete",
        { session_id: presign.data.session_id },
      );
      return complete.data;
    } catch (error) {
      const form = new FormData();
      form.append("file", file);
      const fallback = await apiClient.post<UploadedAttachment>(
        "/api/uploads",
        form,
      );
      return fallback.data;
    }
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
