import { apiClient } from "@/lib/axios";

export const messageService = {
  async sendMessage(channelId: string, content: string) {
    const res = await apiClient.post("/api/messages", {
      channel_id: channelId,
      content,
    });
    return res.data;
  },

  async getHistory(channelId: string) {
    const res = await apiClient.get(`/api/messages?channel_id=${channelId}`);
    return res.data;
  },
};
