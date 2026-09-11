"use client";

import { useEffect, useState } from "react";
import PageContainer from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { IconBookmarkOff } from "@tabler/icons-react";
import {
  productivityService,
  type SavedMessage,
} from "@/features/workspace/services/productivityService";

export default function SavedPage() {
  const [items, setItems] = useState<SavedMessage[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    void productivityService
      .listSavedMessages()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

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
      pageTitle="Saved items"
      pageDescription="Messages you saved for later"
    >
      <div className="max-w-2xl space-y-2">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing saved yet.</p>
        ) : (
          items.map((item) => (
            <article
              key={item.message_id}
              className="border-border bg-card rounded-lg border p-4"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Saved {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={removing === item.message_id}
                  onClick={() => void unsave(item.message_id)}
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
