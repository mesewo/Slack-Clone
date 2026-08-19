import { apiClient } from "@/lib/axios";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  created_at: string;
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
};
