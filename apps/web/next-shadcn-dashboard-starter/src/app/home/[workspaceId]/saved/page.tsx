"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageContainer from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { IconBookmarkOff } from "@tabler/icons-react";
import { toast } from "sonner";
import {
  productivityService,
  type SavedMessage,
} from "@/features/workspace/services/productivityService";

export default function SavedPage() {
  type LaterState = "in-progress" | "archived" | "completed";
  type LaterTab = LaterState;
  const [items, setItems] = useState<SavedMessage[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [tab, setTab] = useState<LaterTab>("in-progress");
  const [itemStates, setItemStates] = useState<Record<string, LaterState>>({});
  const [statesLoaded, setStatesLoaded] = useState(false);
  const router = useRouter();
  useEffect(() => {
    try {
      setItemStates(JSON.parse(window.localStorage.getItem("slack_later_item_states") || "{}"));
    } catch {
      setItemStates({});
    }
    setStatesLoaded(true);
    void productivityService
      .listSavedMessages()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (statesLoaded) window.localStorage.setItem("slack_later_item_states", JSON.stringify(itemStates));
  }, [itemStates, statesLoaded]);

  const visibleItems = useMemo(() => items.filter((item) => (itemStates[item.message_id] || "in-progress") === tab), [items, itemStates, tab]);

  function openSavedItem(item: SavedMessage) {
    const workspaceId = window.localStorage.getItem("active_workspace_id");
    if (!workspaceId) {
      toast.info("Open a workspace first.");
      return;
    }
    if (item.conversation_id) router.push(`/home/${workspaceId}/dms/${item.conversation_id}`);
    else if (item.channel_id) router.push(`/home/${workspaceId}/channels/${item.channel_id}`);
    else toast.info("The original conversation is unavailable.");
  }

  async function unsave(messageId: string) {
    setRemoving(messageId);
    setItems((current) =>
      current.filter((item) => item.message_id !== messageId),
    );
    try {
      await productivityService.unsaveMessage(messageId);
    } catch {
      const restored = await productivityService
        .listSavedMessages()
        .catch(() => []);
      setItems(restored);
    } finally {
      setRemoving(null);
    }
  }
  return (
    <PageContainer
      pageTitle="Later"
      pageDescription="Messages you saved to come back to."
    >
      <div className="max-w-2xl space-y-2">
        <div className="border-border flex flex-wrap gap-2 border-b pb-3">
          {(["in-progress", "archived", "completed"] as LaterTab[]).map((value) => (
            <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-full px-3 py-1.5 text-sm capitalize transition-colors ${tab === value ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent"}`}>
              {value === "in-progress" ? "In progress" : value}
              <span className="ml-1">({items.filter((item) => (itemStates[item.message_id] || "in-progress") === value).length})</span>
            </button>
          ))}
        </div>
        {visibleItems.length === 0 ? (
          <p className="text-muted-foreground py-5 text-sm">{tab === "in-progress" ? "Nothing in progress. Save a message to find it here later." : `No ${tab} items.`}</p>
        ) : (
          visibleItems.map((item) => (
            <article
              key={item.message_id}
              className="border-border bg-card rounded-lg border p-4"
            >
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => openSavedItem(item)} className="hover:bg-accent/30 min-w-0 flex-1 rounded-md text-left transition-colors" aria-label="Open saved message in conversation">
                  <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Saved {new Date(item.created_at).toLocaleString()}
                  </p>
                </button>
                {tab === "in-progress" && <>
                  <Button type="button" variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); setItemStates((current) => ({ ...current, [item.message_id]: "completed" })); }} aria-label="Mark complete">Complete</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); setItemStates((current) => ({ ...current, [item.message_id]: "archived" })); }}>Archive</Button>
                </>}
                {tab !== "in-progress" && <Button type="button" variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); setItemStates((current) => ({ ...current, [item.message_id]: "in-progress" })); }}>Move to In progress</Button>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={removing === item.message_id}
                  onClick={(event) => { event.stopPropagation(); void unsave(item.message_id); }}
                  aria-label="Remove saved message"
                  title="Remove saved message"
                >
                  <IconBookmarkOff className="size-4" />
                </Button>
              </div>
            </article>
          ))
        )}
      </div>
    </PageContainer>
  );
}
