import { apiClient } from "@/lib/axios";

export interface AuthUser {
  id: string;
  email: string;
}

export const authService = {
  async register(data: {
    email: string;
    password: string;
    display_name: string;
  }): Promise<AuthUser> {
    const res = await apiClient.post<AuthUser>("/api/auth/register", data);
    return res.data;
  },

  async login(data: { email: string; password: string }): Promise<AuthUser> {
    const res = await apiClient.post<AuthUser>("/api/auth/login", data);
    return res.data;
  },

  async logout(): Promise<void> {
    await apiClient.post("/api/auth/logout");
  },
};
