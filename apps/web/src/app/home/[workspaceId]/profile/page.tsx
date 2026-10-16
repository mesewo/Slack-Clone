"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, logout } from "@/lib/auth";
import { useTheme } from "next-themes";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  productivityService,
  type NotificationPreferences,
} from "@/features/workspace/services/productivityService";
import { startThemeTransition } from "@/lib/theme-transition";
import { cn } from "@/lib/utils";
import { AVATAR_PRESETS } from "@/features/profile/utils/avatar-presets";
import { IconClock, IconMoodSmile, IconPhone, IconMail, IconBriefcase } from "@tabler/icons-react";

export default function WorkspaceProfilePage() {
  const params = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<"profile" | "preferences">("profile");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [presenceStatus, setPresenceStatus] = useState("active");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusEmoji, setStatusEmoji] = useState("💬");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences | null>(null);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setFullName(user.name || "");
    setDisplayName(
      window.localStorage.getItem("slack_profile_display_name") ||
        user.name ||
        ""
    );
    setTitle(window.localStorage.getItem("slack_profile_title") || "Teammate");
    setPhone(window.localStorage.getItem("slack_profile_phone") || "");
    setStatusMessage(window.localStorage.getItem("slack_profile_status_msg") || "");
    setStatusEmoji(window.localStorage.getItem("slack_profile_status_emoji") || "💬");

    void productivityService
      .getProfile()
      .then((profile) => {
        if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
        if (profile.display_name) setDisplayName(profile.display_name);
        if (profile.presence_status) setPresenceStatus(profile.presence_status);
      })
      .catch(() => {
        setAvatarUrl(window.localStorage.getItem("slack_profile_avatar") || "");
      });

    void productivityService
      .getNotificationPreferences()
      .then(setNotificationPreferences)
      .catch(() => setNotificationPreferences(null));
  }, [user]);

  const handleAvatarChange = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const nextAvatarUrl = String(reader.result || "");
      setAvatarUrl(nextAvatarUrl);
      void productivityService.updateProfile({ avatar_url: nextAvatarUrl });
      window.localStorage.setItem("slack_profile_avatar", nextAvatarUrl);
      window.dispatchEvent(new CustomEvent("slack:avatar-updated", { detail: nextAvatarUrl }));
      toast.success("Profile photo updated");
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setAvatarUrl("");
    void productivityService.updateProfile({ avatar_url: "" });
    window.localStorage.removeItem("slack_profile_avatar");
    window.dispatchEvent(new CustomEvent("slack:avatar-updated", { detail: "" }));
    toast.success("Profile photo removed");
  };

  const saveProfileField = (field: string, value: string) => {
    const trimmed = value.trim();
    if (field === "displayName") {
      setDisplayName(trimmed);
      void productivityService.updateProfile({ display_name: trimmed });
      window.localStorage.setItem("slack_profile_display_name", trimmed);
    } else if (field === "title") {
      setTitle(trimmed);
      window.localStorage.setItem("slack_profile_title", trimmed);
    } else if (field === "phone") {
      setPhone(trimmed);
      window.localStorage.setItem("slack_profile_phone", trimmed);
    }
    setEditingField(null);
    toast.success("Profile updated");
  };

  const saveStatus = (emoji: string, msg: string) => {
    setStatusEmoji(emoji);
    setStatusMessage(msg);
    window.localStorage.setItem("slack_profile_status_emoji", emoji);
    window.localStorage.setItem("slack_profile_status_msg", msg);
    setStatusDialogOpen(false);
    toast.success("Status updated");
  };

  const clearStatus = () => {
    setStatusMessage("");
    setStatusEmoji("💬");
    window.localStorage.removeItem("slack_profile_status_emoji");
    window.localStorage.removeItem("slack_profile_status_msg");
    setStatusDialogOpen(false);
    toast.success("Status cleared");
  };

  const savePresence = (nextStatus: string) => {
    setPresenceStatus(nextStatus);
    void productivityService.updateProfile({ presence_status: nextStatus });
    toast.success(
      nextStatus === "active" ? "Set yourself as active" : "Set yourself as away"
    );
  };

  const updateNotification = async (
    key: keyof NotificationPreferences,
    value: boolean
  ) => {
    if (!notificationPreferences) return;
    const next = { ...notificationPreferences, [key]: value };
    setNotificationPreferences(next);
    setSavingNotifications(true);
    try {
      await productivityService.updateNotificationPreferences(next);
    } catch {
      setNotificationPreferences(notificationPreferences);
      toast.error("Could not update notifications");
    } finally {
      setSavingNotifications(false);
    }
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
      <div role="status" aria-label="Loading profile" className="mx-auto w-full max-w-4xl animate-pulse space-y-6 p-6">
        <div className="h-7 w-48 rounded bg-muted" />
        <div className="h-14 rounded-xl border border-border bg-muted/40" />
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="h-80 rounded-xl border border-border bg-muted/40" />
          <div className="h-64 rounded-xl border border-border bg-muted/40" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-6">
        <p className="text-muted-foreground">You are signed out.</p>
        <Button onClick={() => router.replace("/auth/sign-in")}>Sign in</Button>
      </div>
    );
  }

  const localTime = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-background text-foreground">
      {/* Slack Header */}
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border/80 bg-background/95 px-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="size-8 rounded-full"
            title="Go back"
          >
            <Icons.chevronLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold">Profile & preferences</h1>
            <p className="text-xs text-muted-foreground">Manage your identity and Slack settings</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded-md transition-all",
              activeTab === "profile"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preferences")}
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded-md transition-all",
              activeTab === "preferences"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Preferences
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mx-auto w-full max-w-3xl p-6 space-y-6">
        {activeTab === "profile" ? (
          <>
            {/* Top Identity Card */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 rounded-2xl border border-border/80 bg-card p-6 shadow-xs">
              <div className="relative group shrink-0">
                <Avatar className="size-24 rounded-2xl border border-border/60 shadow-md">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt={displayName || user.name || "Avatar"}
                      className="size-full object-cover"
                    />
                  ) : (
                    <AvatarFallback className="bg-primary/15 text-primary text-2xl font-bold rounded-2xl">
                      {(displayName || user.name || user.email || "U")
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span
                  className={cn(
                    "absolute -bottom-1 -right-1 size-5 rounded-full border-2 border-background",
                    presenceStatus === "active" ? "bg-emerald-500" : "bg-zinc-400"
                  )}
                  title={presenceStatus === "active" ? "Active" : "Away"}
                />
              </div>

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleAvatarChange(e.target.files?.[0])}
              />

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-bold text-foreground">
                    {displayName || user.name || "Teammate"}
                  </h2>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold text-primary uppercase tracking-wider">
                    {presenceStatus === "active" ? "Active" : "Away"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{title || "No title set"}</p>
                <p className="text-xs text-muted-foreground font-mono">{user.email}</p>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs rounded-lg"
                    onClick={() => document.getElementById("profile-avatar-gallery")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  >
                    Choose avatar
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs rounded-lg" onClick={() => avatarInputRef.current?.click()}>Upload photo</Button>
                  {avatarUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:bg-destructive/10 rounded-lg"
                      onClick={handleRemovePhoto}
                    >
                      Remove
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs rounded-lg"
                    onClick={() =>
                      savePresence(presenceStatus === "active" ? "away" : "active")
                    }
                  >
                    Set as {presenceStatus === "active" ? "away" : "active"}
                  </Button>
                </div>
              </div>
            </div>

            <section id="profile-avatar-gallery" className="rounded-xl border border-border/80 bg-card p-5 shadow-xs">
              <h3 className="text-sm font-semibold">Choose a profile picture</h3>
              <p className="mt-1 text-xs text-muted-foreground">Pick an illustrated avatar for your workspace profile.</p>
              <div className="mt-4 grid grid-cols-5 gap-3 sm:grid-cols-8">
                {AVATAR_PRESETS.map((preset) => (
                  <button key={preset.id} type="button" onClick={() => {
                    setAvatarUrl(preset.url);
                    window.localStorage.setItem("slack_profile_avatar", preset.url);
                    window.dispatchEvent(new CustomEvent("slack:avatar-updated", { detail: preset.url }));
                    void productivityService.updateProfile({ avatar_url: preset.url }).then(() => toast.success("Profile photo updated")).catch(() => toast.error("Could not update profile photo"));
                  }} aria-label={`Choose ${preset.name} avatar`} title={`${preset.name} - ${preset.category}`} className={`aspect-square overflow-hidden rounded-full border-2 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${avatarUrl === preset.url ? "border-primary ring-2 ring-primary/25" : "border-border"}`}>
                    <img src={preset.url} alt="" className="size-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            </section>

            {/* Custom Status Pill */}
            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{statusEmoji}</span>
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      {statusMessage ? statusMessage : "What's your status?"}
                    </p>
                    <p className="text-[0.65rem] text-muted-foreground">
                      {statusMessage
                        ? "Teammates can see this next to your name"
                        : "Let your team know if you're in a meeting or out for lunch"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {statusMessage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={clearStatus}
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setStatusDialogOpen(true)}
                  >
                    {statusMessage ? "Edit status" : "Set status"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Profile Fields List */}
            <div className="rounded-xl border border-border/80 bg-card divide-y divide-border/60 shadow-xs">
              {/* Display Name */}
              <div className="p-4 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">Display name</p>
                  {editingField === "displayName" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        defaultValue={displayName}
                        id="display-name-input"
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                      />
                      <Button
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          const el = document.getElementById(
                            "display-name-input"
                          ) as HTMLInputElement;
                          if (el) saveProfileField("displayName", el.value);
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setEditingField(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {displayName || "Not set (using your full name)"}
                    </p>
                  )}
                </div>
                {editingField !== "displayName" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setEditingField("displayName")}
                  >
                    Edit
                  </Button>
                )}
              </div>

              {/* Title / Role */}
              <div className="p-4 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <IconBriefcase className="size-3.5 text-muted-foreground" />
                    <span>What I do</span>
                  </div>
                  {editingField === "title" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        defaultValue={title}
                        id="title-input"
                        placeholder="e.g. Senior Frontend Engineer"
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                      />
                      <Button
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          const el = document.getElementById(
                            "title-input"
                          ) as HTMLInputElement;
                          if (el) saveProfileField("title", el.value);
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setEditingField(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {title || "Add what you do at the company"}
                    </p>
                  )}
                </div>
                {editingField !== "title" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setEditingField("title")}
                  >
                    Edit
                  </Button>
                )}
              </div>

              {/* Email Address */}
              <div className="p-4 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <IconMail className="size-3.5 text-muted-foreground" />
                    <span>Email address</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {user.email}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    navigator.clipboard.writeText(user.email);
                    toast.success("Email copied to clipboard");
                  }}
                >
                  Copy
                </Button>
              </div>

              {/* Phone Number */}
              <div className="p-4 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <IconPhone className="size-3.5 text-muted-foreground" />
                    <span>Phone number</span>
                  </div>
                  {editingField === "phone" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        defaultValue={phone}
                        id="phone-input"
                        placeholder="+1 (555) 012-3456"
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                      />
                      <Button
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          const el = document.getElementById(
                            "phone-input"
                          ) as HTMLInputElement;
                          if (el) saveProfileField("phone", el.value);
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setEditingField(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {phone || "Add a phone number"}
                    </p>
                  )}
                </div>
                {editingField !== "phone" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setEditingField("phone")}
                  >
                    Edit
                  </Button>
                )}
              </div>

              {/* Local Time and Timezone */}
              <div className="p-4 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <IconClock className="size-3.5 text-muted-foreground" />
                    <span>Time zone & local time</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {localTime} · {timezone}
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* PREFERENCES TAB */
          <div className="space-y-6">
            {/* Appearance / Theme */}
            <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs">
              <h3 className="text-sm font-bold text-foreground">Color mode</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose how Slack looks to you. Select a single theme, or sync with your system.
              </p>

              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { id: "light", label: "Light", icon: "☀️" },
                  { id: "dark", label: "Dark", icon: "🌙" },
                  { id: "system", label: "System", icon: "💻" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={(e) => {
                      startThemeTransition(() => setTheme(mode.id), e);
                      toast.success(`${mode.label} theme activated`);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all",
                      theme === mode.id
                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                        : "border-border bg-background/50 hover:bg-accent/40 text-foreground"
                    )}
                  >
                    <span className="text-xl">{mode.icon}</span>
                    <span>{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Notification Preferences */}
            <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs">
              <h3 className="text-sm font-bold text-foreground">Notifications</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure what activities trigger alerts and badges.
              </p>

              <div className="mt-4 space-y-3">
                {notificationPreferences &&
                  (
                    [
                      ["mentions", "Mentions and @channel alerts"],
                      ["direct_messages", "Direct messages"],
                      ["thread_replies", "Replies to threads I'm following"],
                      ["reactions", "Reactions to my messages"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-3 text-xs font-medium cursor-pointer py-1"
                    >
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={notificationPreferences[key]}
                        disabled={savingNotifications}
                        onChange={(e) =>
                          void updateNotification(key, e.target.checked)
                        }
                        className="accent-primary size-4 rounded cursor-pointer"
                      />
                    </label>
                  ))}
              </div>
            </div>

            {/* Account / Sign out */}
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-xs">
              <h3 className="text-sm font-bold text-destructive">Account actions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sign out of this workspace on this device.
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="mt-4"
                disabled={signingOut}
                onClick={handleSignOut}
              >
                {signingOut ? "Signing out..." : "Sign out of workspace"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Set Status Modal Dialog */}
      {statusDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setStatusDialogOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-popover p-5 shadow-2xl text-popover-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <h3 className="text-sm font-bold">Set a status</h3>
              <button
                type="button"
                onClick={() => setStatusDialogOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Icons.close className="size-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                id="status-emoji-input"
                defaultValue={statusEmoji}
                className="size-10 text-center text-lg rounded-lg border border-input bg-background"
                maxLength={2}
              />
              <input
                id="status-text-input"
                defaultValue={statusMessage}
                placeholder="What's your status?"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none"
              />
            </div>

            {/* Quick Status Presets (Slack defaults) */}
            <div className="mt-4 space-y-1">
              <p className="text-[0.68rem] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Quick presets
              </p>
              {[
                ["🗓️", "In a meeting"],
                ["🏠", "Working remotely"],
                ["🥪", "Out for lunch"],
                ["🤒", "Out sick"],
                ["🌴", "On vacation"],
                ["🎯", "Focusing"],
              ].map(([emoji, text]) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => {
                    const eIn = document.getElementById(
                      "status-emoji-input"
                    ) as HTMLInputElement;
                    const tIn = document.getElementById(
                      "status-text-input"
                    ) as HTMLInputElement;
                    if (eIn) eIn.value = emoji;
                    if (tIn) tIn.value = text;
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-left hover:bg-accent transition"
                >
                  <span className="text-base">{emoji}</span>
                  <span>{text}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-border/60">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setStatusDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs"
                onClick={() => {
                  const eIn = document.getElementById(
                    "status-emoji-input"
                  ) as HTMLInputElement;
                  const tIn = document.getElementById(
                    "status-text-input"
                  ) as HTMLInputElement;
                  saveStatus(eIn?.value || "💬", tIn?.value || "");
                }}
              >
                Save status
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

