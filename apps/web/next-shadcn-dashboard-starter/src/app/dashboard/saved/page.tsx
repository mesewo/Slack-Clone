"use client";

import { useEffect, useState } from "react";
import PageContainer from "@/components/layout/page-container";
import {
  productivityService,
  type SavedMessage,
} from "@/features/workspace/services/productivityService";

export default function SavedPage() {
  const [items, setItems] = useState<SavedMessage[]>([]);
  useEffect(() => {
    void productivityService
      .listSavedMessages()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
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
              <p className="text-sm whitespace-pre-wrap">{item.content}</p>
              <p className="text-muted-foreground mt-2 text-xs">
                Saved {new Date(item.created_at).toLocaleString()}
              </p>
            </article>
          ))
        )}
      </div>
    </PageContainer>
  );
}
