// src/lib/auth.ts
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

// Client-side auth helpers
export async function login(email: string, password: string): Promise<Session> {
  const response = await fetch(`${GO_API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }

  const session = await response.json();
  // Server sets an HttpOnly cookie (`token`) on successful login. Do not set
  // client-side cookies here to avoid mismatched cookie names and HttpOnly
  // semantics. The client will rely on the browser sending the server-set
  // cookie for subsequent requests (axios `withCredentials: true`).
  return session;
}

export async function logout() {
  await fetch(`${GO_API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function register(
  email: string,
  password: string,
  name?: string,
): Promise<User> {
  const response = await fetch(`${GO_API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, display_name: name }),
  });

  if (!response.ok) {
    throw new Error("Registration failed");
  }

  return response.json();
}

// React hook for client-side auth
import { useEffect, useState } from "react";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/me", { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  return { user, loading };
}
