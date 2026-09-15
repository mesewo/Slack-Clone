"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { channelService } from "@/features/workspace/services/channelService";
import {
  workspaceService,
  type Workspace,
} from "@/features/workspace/services/workspaceService";

type WorkspaceWithMemberCount = Workspace & { memberCount: number | null };

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMemberCount[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openingWorkspaceId, setOpeningWorkspaceId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [showUpgradeCard, setShowUpgradeCard] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const items = await workspaceService.list();
      const enriched = await Promise.all(
        items.map(async (workspace) => {
          try {
            const result = await workspaceService.listMembers(workspace.id);
            return { ...workspace, memberCount: result.members.length };
          } catch {
            return { ...workspace, memberCount: null };
          }
        }),
      );
      setWorkspaces(enriched);
    } catch {
      setError("Workspaces could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      await workspaceService.create({ name: name.trim() });
      toast.success("Workspace created");
      setName("");
      await load();
    } catch {
      setError("Workspace could not be created.");
    } finally {
      setCreating(false);
    }
  };

  const joinWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!slug.trim()) return;
    setJoining(true);
    setError("");
    try {
      await workspaceService.join(slug.trim());
      toast.success("Joined workspace");
      setSlug("");
      await load();
    } catch {
      setError("Workspace not found or could not be joined.");
    } finally {
      setJoining(false);
    }
  };

  const openWorkspace = async (workspaceId: string) => {
    setOpeningWorkspaceId(workspaceId);
    setError("");
    try {
      const channels = await channelService.list(workspaceId);
      window.localStorage.setItem("active_workspace_id", workspaceId);
      const lastVisited = window.localStorage.getItem(
        `slack_last_conversation_id:${workspaceId}`,
      );
      router.push(
        lastVisited
          ? lastVisited.startsWith("dm:")
            ? `/home/${workspaceId}/dms/${lastVisited.slice(3)}`
            : `/home/${workspaceId}/channels/${lastVisited}`
          : channels[0]
            ? `/home/${workspaceId}/channels/${channels[0].id}`
            : `/home/${workspaceId}`,
      );
    } catch {
      setError("Workspace channels could not be loaded.");
    } finally {
      setOpeningWorkspaceId(null);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-sidebar-primary uppercase">
            Your workspace hub
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Where do you want to work?
          </h1>
          <p className="text-muted-foreground mt-3 text-sm sm:text-base">
            Pick a workspace to jump back into the conversation, or create a new
            space for your team.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-labelledby="my-workspaces-heading">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="my-workspaces-heading" className="text-lg font-semibold">
                My Workspaces
              </h2>
              <span className="text-muted-foreground text-xs">
                {workspaces.length} workspace
                {workspaces.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="border-border/70 divide-border/70 divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
              {loading ? (
                <div
                  className="space-y-3 p-5"
                  role="status"
                  aria-label="Loading workspaces"
                >
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="bg-muted h-14 animate-pulse rounded-lg"
                    />
                  ))}
                </div>
              ) : workspaces.length > 0 ? (
                workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => void openWorkspace(workspace.id)}
                    disabled={openingWorkspaceId === workspace.id}
                    className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-accent/40 disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="bg-sidebar-primary text-sidebar-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold">
                      {workspace.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {workspace.name}
                      </span>
                      <span className="text-muted-foreground mt-1 block text-xs">
                        {workspace.memberCount === null
                          ? "Members unavailable"
                          : `${workspace.memberCount} member${workspace.memberCount === 1 ? "" : "s"}`}{" "}
                        · {workspace.slug}
                      </span>
                    </span>
                    <Icons.arrowRight className="text-muted-foreground size-5 shrink-0 transition-transform group-hover:translate-x-1 group-hover:text-sidebar-primary" />
                  </button>
                ))
              ) : (
                <p className="text-muted-foreground p-6 text-sm">
                  No workspaces yet.
                </p>
              )}
            </div>

            {error && <p className="text-destructive mt-3 text-sm">{error}</p>}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <form
                onSubmit={createWorkspace}
                className="border-border/70 rounded-xl border bg-card p-4"
              >
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Icons.add className="text-sidebar-primary size-4" /> Create a
                  new workspace
                </div>
                <div className="flex gap-2">
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Workspace name"
                    aria-label="Workspace name"
                  />
                  <Button type="submit" disabled={creating || !name.trim()}>
                    {creating ? "Creating..." : "Create"}
                  </Button>
                </div>
              </form>
              <form
                onSubmit={joinWorkspace}
                className="border-border/70 rounded-xl border bg-card p-4"
              >
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Icons.externalLink className="text-sidebar-primary size-4" />{" "}
                  Join by workspace slug
                </div>
                <div className="flex gap-2">
                  <Input
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    placeholder="workspace-slug"
                    aria-label="Workspace slug"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={joining || !slug.trim()}
                  >
                    {joining ? "Joining..." : "Join"}
                  </Button>
                </div>
              </form>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="relative overflow-hidden rounded-xl bg-sidebar p-5 text-sidebar-foreground shadow-sm">
              <Icons.settings className="mb-8 size-6 text-sidebar-primary" />
              <h2 className="font-semibold">Connect your tools</h2>
              <p className="mt-2 text-sm text-sidebar-foreground/70">
                Bring the work you already do into one focused place.
              </p>
              <Button
                variant="secondary"
                className="mt-5"
                onClick={() => toast.info("Tool connections are coming soon.")}
              >
                Explore tools
              </Button>
            </div>
            {showUpgradeCard && (
              <div className="border-sidebar-primary/30 bg-sidebar-primary/10 relative rounded-xl border p-5">
                <button
                  type="button"
                  onClick={() => setShowUpgradeCard(false)}
                  className="text-muted-foreground hover:text-foreground absolute top-3 right-3"
                  aria-label="Dismiss promotion"
                >
                  <Icons.close className="size-4" />
                </button>
                <h2 className="pr-5 font-semibold">
                  Make room for bigger ideas
                </h2>
                <p className="text-muted-foreground mt-2 text-sm">
                  More workspace polish is on the way. This preview card is
                  intentionally inactive.
                </p>
                <Button
                  variant="outline"
                  className="mt-5"
                  onClick={() => toast.info("Plans are coming soon.")}
                >
                  Learn more
                </Button>
              </div>
            )}
          </aside>
        </div>

        <section className="mt-12" aria-labelledby="discover-heading">
          <h2 id="discover-heading" className="mb-4 text-lg font-semibold">
            Discover more
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                "Quick start guide",
                "Get oriented in a few minutes.",
                Icons.help,
              ],
              [
                "Desktop app",
                "A native app placeholder for later.",
                Icons.externalLink,
              ],
              [
                "Connect your apps",
                "Integrations are coming soon.",
                Icons.settings,
              ],
            ].map(([title, description, Icon]) => (
              <button
                key={title as string}
                type="button"
                onClick={() => toast.info(`${title as string} is coming soon.`)}
                className="border-border/70 group rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40"
              >
                <span className="bg-sidebar-primary/15 text-sidebar-primary flex size-9 items-center justify-center rounded-lg">
                  <Icon className="size-4" />
                </span>
                <span className="mt-4 block text-sm font-medium">
                  {title as string}
                </span>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {description as string}
                </span>
              </button>
            ))}
          </div>
        </section>

        <footer className="border-border/70 text-muted-foreground mt-14 flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-xs">
          <span>Slack Clone · Built for focused team conversations</span>
          <span className="flex items-center gap-4">
            <a
              className="hover:text-foreground"
              href="https://github.com/mesewo/slack-clone"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => toast.info("Documentation is coming soon.")}
            >
              Docs
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
