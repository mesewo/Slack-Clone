"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageContainer from "@/components/layout/page-container";
import { messageService, type ThreadSummary } from "@/features/workspace/services/messageService";

export default function ThreadsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void messageService.listThreads()
      .then((items) => { if (!cancelled) setThreads(items); })
      .catch(() => { if (!cancelled) setThreads([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function openThread(thread: ThreadSummary) {
    if (thread.kind === "dm" && thread.conversation_id) {
      router.push(`/home/${workspaceId}/dms/${thread.conversation_id}`);
    } else if (thread.channel_id) {
      router.push(`/home/${workspaceId}/channels/${thread.channel_id}`);
    }
  }

  return (
    <PageContainer pageTitle="Threads" pageDescription="Threads you have joined or follow.">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
        {loading ? (
          <p className="text-muted-foreground p-5 text-sm">Loading threads…</p>
        ) : threads.length ? (
          <div className="divide-y divide-border">
            {threads.map((thread) => (
              <button
                key={`${thread.kind}-${thread.id}`}
                type="button"
                onClick={() => openThread(thread)}
                className="hover:bg-accent/50 block w-full p-4 text-left transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{thread.title}</p>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{thread.preview}</p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">{thread.reply_count} replies</span>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">{new Date(thread.last_activity).toLocaleString()}</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground p-5 text-sm">No threads yet.</p>
        )}
      </div>
      </div>
    </PageContainer>
  );
}
