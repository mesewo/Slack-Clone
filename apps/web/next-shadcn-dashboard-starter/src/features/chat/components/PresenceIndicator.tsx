"use client";

import { IconMoon } from "@tabler/icons-react";

export type ConnectionPresence = "active" | "away" | "dnd" | "offline";

export function PresenceIndicator({
  state,
  customStatus,
  className = "",
  testId,
}: {
  state: ConnectionPresence;
  customStatus?: string | null;
  className?: string;
  testId?: string;
}) {
  const isDnd = state === "dnd";
  const dotClass = isDnd
    ? "bg-rose-500"
    : state === "active"
      ? "bg-emerald-500"
      : state === "away"
        ? "border-amber-500"
        : "bg-muted-foreground/50";

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span
        data-testid={testId}
        className={`relative inline-flex size-2.5 shrink-0 rounded-full ${dotClass} ${state === "away" ? "border-2 bg-transparent" : ""}`}
        title={isDnd ? "Online, do not disturb" : state}
        aria-label={isDnd ? "Online, do not disturb" : state}
      >
        {isDnd && (
          <IconMoon className="absolute -right-1.5 -top-1.5 size-3 text-amber-500" />
        )}
      </span>
      {customStatus && (
        <span className="truncate text-xs text-muted-foreground">
          {customStatus}
        </span>
      )}
    </span>
  );
}
