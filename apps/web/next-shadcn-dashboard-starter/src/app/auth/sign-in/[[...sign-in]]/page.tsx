// src/app/auth/signin/page.tsx
"use client";

import { useState } from "react";
import { login, register } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function SignIn() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (mode === "sign-up") {
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          return;
        }
        await register(email, password, name);
        setName("");
        setEmail("");
        setPassword("");
        setMode("sign-in");
        setError("");
        return;
      }

      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(
        mode === "sign-up" ? "Could not create account" : "Invalid credentials",
      );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("sign-in")}
            className={`flex-1 rounded px-3 py-2 ${mode === "sign-in" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("sign-up")}
            className={`flex-1 rounded px-3 py-2 ${mode === "sign-up" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            Create Account
          </button>
        </div>

        <h1 className="text-2xl font-bold">
          {mode === "sign-in" ? "Sign In" : "Create Account"}
        </h1>
        {error && <div className="text-sm text-red-500">{error}</div>}

        {mode === "sign-up" && (
          <input
            type="text"
            placeholder="Display Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-border bg-background p-2"
            required
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-border bg-background p-2"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-border bg-background p-2"
          required
        />
        <button
          type="submit"
          className="w-full rounded bg-blue-500 p-2 text-white"
        >
          {mode === "sign-in" ? "Sign In" : "Create Account"}
        </button>
      </form>
    </div>
  );
}
