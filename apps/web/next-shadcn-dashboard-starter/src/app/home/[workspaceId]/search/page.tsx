"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import PageContainer from "@/components/layout/page-container";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useWorkspaceMembers } from "@/features/workspace/hooks/use-workspace-members";
import {
  messageService,
  type MessageSearchPage,
  type MessageSearchResult,
} from "@/features/workspace/services/messageService";
import { useChatStore } from "@/features/chat/utils/store";
import { useThemeToggleAction } from "@/components/themes/theme-mode-toggle";
import { settingsSearchDestinations } from "@/features/workspace/utils/settings-search";

type SearchTab = "Messages" | "People" | "Settings";

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function HighlightedContent({ content, query }: { content: string; query: string }) {
  const index = content.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (!query || index < 0) return <>{content}</>;
  return (
    <>
      {content.slice(0, index)}
      <mark className="rounded-sm bg-yellow-200 px-0.5 text-yellow-950">
        {content.slice(index, index + query.length)}
      </mark>
      {content.slice(index + query.length)}
    </>
  );
}

function SearchPageContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = (searchParams.get("q") ?? "").trim();
  const { members, loading: peopleLoading } = useWorkspaceMembers(workspaceId);
  const createDM = useChatStore((state) => state.createDM);
  const toggleTheme = useThemeToggleAction();
  const [tab, setTab] = useState<SearchTab>("Messages");
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResults([]);
    setNextCursor(undefined);
    setHasMore(false);
    setError(false);
    if (query.length < 2) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    void messageService
      .search({ workspaceId, query })
      .then((page) => {
        if (!cancelled) applyPage(page, setResults, setNextCursor, setHasMore);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, workspaceId]);

  const filteredPeople = useMemo(() => {
    const normalized = query.toLocaleLowerCase();
    return members.filter((member) =>
      `${member.display_name} ${member.email}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [members, query]);

  const filteredSettings = useMemo(() => {
    const normalized = query.toLocaleLowerCase();
    return settingsSearchDestinations.filter((setting) =>
      [setting.label, ...setting.keywords].some((value) =>
        value.toLocaleLowerCase().includes(normalized),
      ),
    );
  }, [query]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await messageService.search({
        workspaceId,
        query,
        cursor: nextCursor,
      });
      setResults((current) => [...current, ...page.results]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      toast.error("Could not load more search results.");
    } finally {
      setLoadingMore(false);
    }
  }

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
    <PageContainer
      pageTitle="Search"
      pageDescription={query ? `Results for “${query}”` : "Search messages, people, and settings in this workspace."}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className="mb-4 flex items-center gap-2 border-b border-border" role="tablist" aria-label="Search result types">
          {(["Messages", "People", "Settings"] as const).map((item) => (
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
          <button
            type="button"
            disabled
            title="Coming soon"
            className="text-muted-foreground ml-1 cursor-not-allowed rounded-full border border-border px-3 py-1 text-xs opacity-60"
          >
            DMs
            <span className="sr-only">Coming soon</span>
          </button>
        </div>

        {tab === "Messages" && (
          <div className="max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
            {loading ? (
              <div className="animate-pulse space-y-4 p-5" role="status" aria-label="Loading search results">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="space-y-2 border-b border-border pb-4 last:border-0">
                    <div className="bg-muted h-4 w-40 rounded" />
                    <div className="bg-muted h-4 w-full rounded" />
                    <div className="bg-muted h-3 w-24 rounded" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <p className="text-destructive p-5 text-sm">Search failed. Please try again.</p>
            ) : query.length < 2 || results.length === 0 ? (
              <p className="text-muted-foreground p-5 text-sm">No results for “{query}”</p>
            ) : (
              <div className="divide-y divide-border">
                {results.map((result) => {
                  const channelName = (result.channel_name ?? "channel").replace(/^#\s*/, "");
                  return (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => router.push(`/home/${workspaceId}/channels/${result.channel_id}`)}
                      className="hover:bg-accent/50 block w-full p-4 text-left transition-colors"
                    >
                      <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs">
                        <span className="text-foreground font-medium">#{channelName}</span>
                        <span>{result.author || "Unknown"}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={result.created_at}>{relativeTime(result.created_at)}</time>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        <HighlightedContent content={result.content} query={query} />
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
            {hasMore && !loading && (
              <div className="border-t border-border p-3 text-center">
                <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </div>
        )}

        {tab === "People" && (
          <div className="max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
            {peopleLoading ? (
              <div className="animate-pulse space-y-3 p-5" role="status" aria-label="Loading people">
                {[0, 1, 2].map((item) => <div key={item} className="bg-muted h-12 rounded" />)}
              </div>
            ) : filteredPeople.length ? (
              <div className="divide-y divide-border">
                {filteredPeople.map((member) => (
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
              <p className="text-muted-foreground p-5 text-sm">No people found for “{query}”</p>
            )}
          </div>
        )}

        {tab === "Settings" && (
          <div className="max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
            {filteredSettings.length ? (
              <div className="divide-y divide-border">
                {filteredSettings.map((setting) => (
                  <button
                    key={setting.label}
                    type="button"
                    onClick={() => {
                      if (setting.action === "toggle-theme") {
                        toggleTheme();
                        return;
                      }
                      const path = setting.pathBuilder?.(workspaceId);
                      if (path) router.push(path);
                    }}
                    className="hover:bg-accent/50 flex w-full items-center gap-3 p-3 text-left transition-colors"
                  >
                    <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <span className="text-sm font-semibold" aria-hidden="true">{setting.label.slice(0, 1)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{setting.label}</span>
                      <span className="text-muted-foreground block truncate text-xs">{setting.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground p-5 text-sm">No settings found for “{query}”</p>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function applyPage(
  page: MessageSearchPage,
  setResults: (results: MessageSearchResult[]) => void,
  setCursor: (cursor: string | undefined) => void,
  setHasMore: (hasMore: boolean) => void,
) {
  setResults(page.results);
  setCursor(page.nextCursor);
  setHasMore(page.hasMore);
}

function SearchPageFallback() {
  return (
    <div className="flex min-h-0 flex-1 animate-pulse flex-col gap-4 p-6">
      <div className="bg-muted h-8 w-48 rounded" />
      <div className="bg-muted h-40 w-full max-w-3xl rounded-lg" />
      <div className="bg-muted h-40 w-full max-w-3xl rounded-lg" />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageFallback />}>
      <SearchPageContent />
    </Suspense>
  );
}
