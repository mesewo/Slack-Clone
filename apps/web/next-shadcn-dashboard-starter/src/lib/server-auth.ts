import { cookies } from "next/headers";

const GO_API_URL = process.env.GO_API_URL || "http://localhost:8080";

export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

export interface Session {
  user: User;
  token: string;
  expiresAt: string;
}

export async function getServerSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) return null;

  try {
    const response = await fetch(`${GO_API_URL}/api/auth/verify`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return null;

    return await response.json();
  } catch (error) {
    console.error("Auth verification failed:", error);
    return null;
  }
}
