import { apiClient } from "@/lib/axios";

export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  type: "PUBLIC" | "PRIVATE";
  created_by: string | null;
  created_at: string;
}

export const channelService = {
  async create(data: {
    workspace_id: string;
    name: string;
    type?: "PUBLIC" | "PRIVATE";
  }): Promise<Channel> {
    const res = await apiClient.post<Channel>("/api/channels", data);
    return res.data;
  },

  async join(channelId: string): Promise<void> {
    await apiClient.post(`/api/channels/${channelId}/join`);
  },

  async list(workspaceId: string): Promise<Channel[]> {
    const res = await apiClient.get<Channel[]>("/api/channels", {
      params: { workspace_id: workspaceId },
    });
    return res.data;
  },
};
