"use client";

import { Button } from "@/components/ui/button";
import { logout, useAuth } from "@/lib/auth";
import { Icons } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  productivityService,
  type NotificationPreferences,
} from "@/features/workspace/services/productivityService";

export default function ProfileViewPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [presenceStatus, setPresenceStatus] = useState("active");
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences | null>(null);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    void productivityService
      .getProfile()
      .then((profile) => {
        setAvatarUrl(profile.avatar_url);
        setDisplayName(profile.display_name || user.name || "");
        setPresenceStatus(profile.presence_status || "active");
      })
      .catch(() => {
        setAvatarUrl(window.localStorage.getItem("slack_profile_avatar") || "");
        setDisplayName(
          window.localStorage.getItem("slack_profile_display_name") ||
            user.name ||
            "",
        );
      });
  }, [user?.name]);

  useEffect(() => {
    if (!user) return;
    void productivityService
      .getNotificationPreferences()
      .then(setNotificationPreferences)
      .catch(() => setNotificationPreferences(null));
  }, [user]);

  const updateNotificationPreference = async (
    key: keyof NotificationPreferences,
    value: boolean,
  ) => {
    if (!notificationPreferences) return;
    const previousPreferences = notificationPreferences;
    const nextPreferences = { ...previousPreferences, [key]: value };
    setNotificationPreferences(nextPreferences);
    setSavingNotifications(true);
    try {
      const saved =
        await productivityService.updateNotificationPreferences(
          nextPreferences,
        );
      setNotificationPreferences(saved);
    } catch {
      setNotificationPreferences(previousPreferences);
      toast.error("Could not update notification preferences");
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleAvatarChange = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const nextAvatarUrl = String(reader.result || "");
      setAvatarUrl(nextAvatarUrl);
      void productivityService.updateProfile({ avatar_url: nextAvatarUrl });
      window.localStorage.setItem("slack_profile_avatar", nextAvatarUrl);
      toast.success("Profile photo updated");
    };
    reader.readAsDataURL(file);
  };

  const saveDisplayName = () => {
    const nextName = displayName.trim();
    if (!nextName) return;
    void productivityService.updateProfile({ display_name: nextName });
    window.localStorage.setItem("slack_profile_display_name", nextName);
    setDisplayName(nextName);
    setEditingName(false);
    toast.success("Profile name updated");
  };

  const savePresenceStatus = (nextStatus: string) => {
    setPresenceStatus(nextStatus);
    void productivityService.updateProfile({ presence_status: nextStatus });
    toast.success(
      `Presence set to ${nextStatus === "dnd" ? "Do not disturb" : nextStatus}`,
    );
  };

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
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="bg-primary text-primary-foreground relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Change profile photo"
          >
            {avatarUrl ? (
              <span
                role="img"
                aria-label="Profile photo"
                className="h-full w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${avatarUrl})` }}
              />
            ) : (
              (user.name || user.email).slice(0, 2).toUpperCase()
            )}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => handleAvatarChange(event.target.files?.[0])}
          />
          <div className="min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="border-border bg-background w-40 rounded border px-2 py-1 text-sm"
                  aria-label="Profile name"
                />
                <Button type="button" size="sm" onClick={saveDisplayName}>
                  Save
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="hover:text-primary flex items-center gap-1 truncate font-medium"
              >
                {displayName || "Local user"}
                <Icons.edit className="size-3.5" />
              </button>
            )}
            <p className="text-muted-foreground truncate text-sm">
              {user.email}
            </p>
            <label className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
              Presence
              <select
                aria-label="Presence status"
                value={presenceStatus}
                onChange={(event) => savePresenceStatus(event.target.value)}
                className="border-border bg-background text-foreground rounded border px-2 py-1 text-xs"
              >
                <option value="active">Active</option>
                <option value="away">Away</option>
                <option value="dnd">Do not disturb</option>
              </select>
            </label>
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
      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Notification preferences</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose which workspace activity reaches you.
        </p>
        <div className="mt-4 space-y-3">
          {notificationPreferences &&
            (
              [
                ["mentions", "Mentions"],
                ["direct_messages", "Direct messages"],
                ["thread_replies", "Thread replies"],
                ["reactions", "Reactions"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={notificationPreferences[key]}
                  disabled={savingNotifications}
                  onChange={(event) =>
                    void updateNotificationPreference(key, event.target.checked)
                  }
                  aria-label={label}
                  className="accent-primary size-4"
                />
              </label>
            ))}
        </div>
      </div>
    </div>
  );
}
