"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import PageContainer from "@/components/layout/page-container";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/features/chat/utils/store";
import { useWorkspaceMembers } from "@/features/workspace/hooks/use-workspace-members";

const tabs = ["People", "Channels", "User groups", "External", "Invitations"] as const;
type DirectoryTab = (typeof tabs)[number];

export default function DirectoriesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversations = useChatStore((state) => state.conversations);
  const createDM = useChatStore((state) => state.createDM);
  const [tab, setTab] = useState<DirectoryTab>(() =>
    searchParams.get("tab") === "Channels" ? "Channels" : "People",
  );
  const [query, setQuery] = useState("");
  const { members, loading } = useWorkspaceMembers(workspaceId);
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);

  useEffect(() => {
    setTab(searchParams.get("tab") === "Channels" ? "Channels" : "People");
  }, [searchParams]);

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) =>
      `${member.display_name} ${member.email}`.toLowerCase().includes(normalized),
    );
  }, [members, query]);

  const channels = useMemo(
    () => conversations.filter((conversation) => conversation.kind !== "dm"),
    [conversations],
  );

  async function openPerson(userId: string) {
    setOpeningUserId(userId);
    try {
      const id = await createDM(userId);
      if (!id) throw new Error("Could not open direct message");
      router.push(`/home/${workspaceId}/dms/${id.slice(3)}`);
    } catch {
      toast.error("Could not open this direct message.");
    } finally {
      setOpeningUserId(null);
    }
  }

  return (
    <PageContainer pageTitle="Directories" pageDescription="Browse people and channels in this workspace.">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain">
        <div className="border-b border-border">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Directory categories">
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                onClick={() => setTab(item)}
                className={`rounded-t-md px-3 py-2 text-sm transition-colors ${tab === item ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {tab === "People" && (
          <div className="max-w-3xl space-y-4">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" aria-label="Search people" />
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {loading ? (
                <p className="text-muted-foreground p-5 text-sm">Loading people…</p>
              ) : filteredMembers.length ? (
                <div className="divide-y divide-border">
                  {filteredMembers.map((member) => (
                    <button
                      key={member.user_id}
                      type="button"
                      disabled={openingUserId !== null}
                      onClick={() => void openPerson(member.user_id)}
                      className="hover:bg-accent/50 flex w-full items-center gap-3 p-3 text-left transition-colors disabled:opacity-60"
                    >
                      <Avatar className="size-9 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                          {(member.display_name || member.email || "U").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{member.display_name || member.email}</span>
                        {member.display_name && <span className="text-muted-foreground block truncate text-xs">{member.email}</span>}
                      </span>
                      <span className={`size-2 rounded-full ${member.presence_status === "active" ? "bg-emerald-500" : "bg-muted-foreground/40"}`} aria-label={member.presence_status === "active" ? "Active" : "Offline"} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground p-5 text-sm">No people found.</p>
              )}
            </div>
          </div>
        )}

        {tab === "Channels" && (
          <div className="max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
            {channels.length ? (
              <div className="divide-y divide-border">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => router.push(`/home/${workspaceId}/channels/${channel.id}`)}
                    className="hover:bg-accent/50 flex w-full items-center gap-3 p-3 text-left transition-colors"
                  >
                    <span className="text-muted-foreground flex size-9 items-center justify-center rounded-lg bg-muted text-lg">#</span>
                    <span className="text-sm font-medium">{channel.name.replace(/^#\s*/, "")}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground p-5 text-sm">No channels found.</p>
            )}
          </div>
        )}

        {tab !== "People" && tab !== "Channels" && (
          <div className="text-muted-foreground flex min-h-48 max-w-3xl items-center justify-center rounded-lg border border-dashed border-border p-8 text-center text-sm">
            {tab} are coming soon.
          </div>
        )}
      </div>
    </PageContainer>
  );
}
