"use client";

import { Button } from "@/components/ui/button";
import { logout, useAuth } from "@/lib/auth";
import { Icons } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ProfileViewPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      router.replace("/auth/sign-in");
    }
  };

  if (loading) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        Loading profile...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex w-full flex-col gap-3 p-6">
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-muted-foreground text-sm">You are signed out.</p>
        <Button
          className="w-fit"
          onClick={() => router.replace("/auth/sign-in")}
        >
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your local workspace account
        </p>
      </div>
      <div className="border-border bg-card rounded-xl border p-5">
        <div className="flex items-center gap-4">
          <div className="bg-primary text-primary-foreground flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold">
            {(user.name || user.email).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name || "Local user"}</p>
            <p className="text-muted-foreground truncate text-sm">
              {user.email}
            </p>
          </div>
        </div>
        <div className="border-border mt-5 border-t pt-5">
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <Icons.logout className="mr-2 h-4 w-4" />
            {signingOut ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      </div>
    </div>
  );
}
