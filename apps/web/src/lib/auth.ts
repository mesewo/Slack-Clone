// src/lib/auth.ts
const GO_API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.GO_API_URL ||
  "http://localhost:8080";

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
  return session;
}

export async function logout() {
  const response = await fetch(`${GO_API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Logout failed");
  }
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
        // Was fetch("/api/me", ...) - wrong host (hit :3000, not the Go API
        // at :8080), wrong path (Go exposes /api/auth/verify, not /api/me),
        // and wrong response shape (Go returns {id, email} flat, not
        // wrapped in {user: ...}). This is almost certainly why login
        // appeared to succeed but the dashboard bounced back to sign-in -
        // this check always resolved to "not logged in" regardless of the
        // actual cookie.
        const response = await fetch(`${GO_API_URL}/api/auth/verify`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setUser({ id: data.id, email: data.email, name: data.name });
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
