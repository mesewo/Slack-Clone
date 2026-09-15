"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  messageService,
  type DirectConversation,
} from "@/features/workspace/services/messageService";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export default function DMsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [dms, setDMs] = useState<DirectConversation[]>([]);
  const [query, setQuery] = useState("");
  const [unreadsOnly, setUnreadsOnly] = useState(false);
  const [showBanner, setShowBanner] = useState(true);

  useEffect(() => {
    void messageService
      .createSelfDM()
      .then(() => messageService.listDMs())
      .then(setDMs)
      .catch(() => setDMs([]));
  }, []);

  const filtered = useMemo(
    () =>
      dms.filter((dm) =>
        `${dm.other_display_name} ${dm.other_email}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [dms, query],
  );
  const openDM = (id: string) => {
    const workspaceId = window.localStorage.getItem("active_workspace_id");
    if (workspaceId) router.push(`/home/${workspaceId}/dms/${id}`);
    else toast.info("Open a workspace first to view this DM.");
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sidebar-primary text-xs font-semibold tracking-[0.18em] uppercase">
              Conversations
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Direct messages</h1>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Compose direct message"
            onClick={() =>
              toast.info("Choose a person from a workspace to start a DM.")
            }
          >
            <Icons.edit className="size-4" />
          </Button>
        </div>
        <div className="mt-6 flex items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a DM..."
            className="max-w-md"
          />
          <Button
            variant={unreadsOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => setUnreadsOnly((value) => !value)}
          >
            {unreadsOnly ? "Unread only" : "Unreads"}
          </Button>
        </div>
        {showBanner && (
          <div className="bg-sidebar mt-6 flex items-center gap-4 rounded-xl p-4 text-sidebar-foreground">
            <span className="bg-sidebar-primary/20 flex size-9 items-center justify-center rounded-lg">
              <Icons.teams className="text-sidebar-primary size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Add coworkers</p>
              <p className="text-sidebar-foreground/65 mt-1 text-xs">
                Invite teammates to keep conversations moving.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast.info("Inviting coworkers is coming soon.")}
            >
              Invite
            </Button>
            <button
              type="button"
              onClick={() => setShowBanner(false)}
              aria-label="Dismiss add coworkers"
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
            >
              <Icons.close className="size-4" />
            </button>
          </div>
        )}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent conversations</h2>
            <span className="text-muted-foreground text-xs">
              {filtered.length}
            </span>
          </div>
          <div className="border-border/70 divide-border/70 divide-y overflow-hidden rounded-xl border bg-card">
            {filtered.map((dm) => (
              <button
                key={dm.id}
                type="button"
                onClick={() => openDM(dm.id)}
                className="hover:bg-accent/40 flex w-full items-center gap-3 p-4 text-left"
              >
                <Avatar className="size-10 rounded-xl">
                  <AvatarFallback className="bg-sidebar-primary/15 text-sidebar-primary rounded-xl">
                    {(dm.other_display_name || dm.other_email)
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {dm.other_user_id === user?.id
                      ? `${dm.other_display_name || dm.other_email} (you)`
                      : dm.other_display_name || dm.other_email}
                  </span>
                  <span className="text-muted-foreground mt-1 block text-xs">
                    {dm.other_email}
                  </span>
                </span>
                <Icons.chevronRight className="text-muted-foreground size-4" />
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-muted-foreground p-8 text-center text-sm">
                <Icons.circleCheck className="text-sidebar-primary mx-auto mb-3 size-8" />
                All caught up
              </div>
            )}
          </div>
        </div>
        <div className="border-border/70 mt-6 rounded-xl border border-dashed p-5">
          <div className="flex items-center gap-3">
            <Icons.user className="text-sidebar-primary size-5" />
            <div>
              <p className="text-sm font-medium">Your space (self-DM)</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Draft messages, list your to-dos, or keep links and files handy.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => router.push("/dashboard/profile")}
          >
            Edit Profile
          </Button>
        </div>
      </div>
    </div>
  );
}
