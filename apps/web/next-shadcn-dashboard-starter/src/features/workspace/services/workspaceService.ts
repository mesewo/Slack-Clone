import { apiClient } from "@/lib/axios";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joined_at: string;
  email: string;
  display_name: string;
  presence_status?: string;
}

function makeUniqueSlug(name: string, attempt = 0): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace";

  if (attempt === 0) return base;
  return `${base}-${Date.now().toString(36)}-${attempt}`;
}

export const workspaceService = {
  async create(data: { name: string; slug?: string }): Promise<Workspace> {
    const baseName = data.name ?? "My Workspace";
    let attempt = 0;

    while (attempt < 5) {
      const payload = {
        ...data,
        name: baseName,
        slug: makeUniqueSlug(data.slug || baseName, attempt),
      };

      try {
        const res = await apiClient.post<Workspace>("/api/workspaces", payload);
        return res.data;
      } catch (error: any) {
        const isConflict = error?.response?.status === 409;
        if (!isConflict) throw error;
        attempt += 1;
      }
    }

    throw new Error("Failed to create a unique workspace slug.");
  },

  async join(slug: string): Promise<Workspace> {
    const res = await apiClient.post<Workspace>("/api/workspaces/join", {
      slug,
    });
    return res.data;
  },

  async list(): Promise<Workspace[]> {
    const res = await apiClient.get<Workspace[]>("/api/workspaces");
    return res.data ?? [];
  },

  async listMembers(workspaceId: string): Promise<{
    role: WorkspaceMember["role"];
    members: WorkspaceMember[];
  }> {
    const res = await apiClient.get(`/api/workspaces/${workspaceId}/members`);
    return res.data;
  },

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceMember["role"],
  ): Promise<WorkspaceMember> {
    const res = await apiClient.patch<WorkspaceMember>(
      `/api/workspaces/${workspaceId}/members/${userId}`,
      { role },
    );
    return res.data;
  },

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    await apiClient.delete(`/api/workspaces/${workspaceId}/members/${userId}`);
  },

  async createInvite(
    workspaceId: string,
  ): Promise<{ token: string; expires_at: string }> {
    const res = await apiClient.post(`/api/workspaces/${workspaceId}/invites`);
    return res.data;
  },

  async acceptInvite(token: string): Promise<{ workspace_id: string }> {
    const res = await apiClient.post(`/api/workspaces/join/${token}`);
    return res.data;
  },
};
