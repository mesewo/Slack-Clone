"use client";

import { useEffect, useState } from "react";
import PageContainer from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  workspaceService,
  type Workspace,
} from "@/features/workspace/services/workspaceService";

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const load = () => workspaceService.list().then(setWorkspaces);
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
      setName("");
      await load();
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
      setSlug("");
      await load();
    } catch {
      setError("Workspace not found or could not be joined.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <PageContainer
      pageTitle="Workspaces"
      pageDescription="Create and switch between your workspaces"
    >
      <div className="max-w-xl space-y-6">
        <form onSubmit={createWorkspace} className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Workspace name"
            aria-label="Workspace name"
          />
          <Button type="submit" disabled={creating || !name.trim()}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </form>
        <form onSubmit={joinWorkspace} className="flex gap-2">
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="Workspace slug"
            aria-label="Workspace slug"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={joining || !slug.trim()}
          >
            {joining ? "Joining..." : "Join"}
          </Button>
        </form>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="space-y-2">
          {workspaces.map((workspace) => (
            <div
              key={workspace.id}
              className="border-border flex items-center justify-between rounded-lg border p-4"
            >
              <div>
                <p className="font-medium">{workspace.name}</p>
                <p className="text-muted-foreground text-xs">
                  {workspace.slug}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  window.localStorage.setItem(
                    "active_workspace_id",
                    workspace.id,
                  );
                  window.location.href = "/dashboard/chat";
                }}
              >
                Open
              </Button>
            </div>
          ))}
          {workspaces.length === 0 && (
            <p className="text-muted-foreground text-sm">No workspaces yet.</p>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
