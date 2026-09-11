import { apiClient } from "@/lib/axios";

export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  type: "PUBLIC" | "PRIVATE";
  created_by: string | null;
  created_at: string;
}

export interface ChannelMember {
  channel_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string;
  email: string;
  display_name: string;
  presence_status?: string;
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

  async listMembers(channelId: string): Promise<ChannelMember[]> {
    const res = await apiClient.get<{ members: ChannelMember[] }>(
      `/api/channels/${channelId}/members`,
    );
    return res.data.members ?? [];
  },

  async addMember(channelId: string, userId: string): Promise<void> {
    await apiClient.post(`/api/channels/${channelId}/members`, {
      user_id: userId,
    });
  },

  async removeMember(channelId: string, userId: string): Promise<void> {
    await apiClient.delete(`/api/channels/${channelId}/members/${userId}`);
  },
};
