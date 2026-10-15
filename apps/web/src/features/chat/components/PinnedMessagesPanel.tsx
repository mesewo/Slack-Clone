"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { pinService, type PinScope, type PinnedMessage } from "@/features/workspace/services/pinService";

export function PinnedMessagesPanel({
  scope,
  onClose,
}: {
  scope: PinScope;
  onClose: () => void;
}) {
  const scopeKey = "channel_id" in scope ? scope.channel_id : scope.conversation_id;
  const [items, setItems] = useState<PinnedMessage[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void pinService.list(scope).then((result) => {
      if (!cancelled) setItems(result);
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; };
  }, [scopeKey]);

  const jumpToMessage = (messageId: string) => {
    onClose();
    window.setTimeout(() => {
      document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };

  return (
    <aside className="border-border bg-background absolute right-0 top-14 z-30 flex h-[calc(100%-3.5rem)] w-[min(22rem,90vw)] flex-col border-l shadow-xl">
      <div className="border-border flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">Pinned messages</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close pinned messages">
          <IconX className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {error ? (
          <p className="text-muted-foreground text-sm">Unable to load pinned messages.</p>
        ) : items.length ? items.map((item) => (
          <div key={item.id} className="group border-border flex items-start gap-2 border-b py-3">
            <button type="button" onClick={() => jumpToMessage(item.message_id)} className="hover:bg-muted min-w-0 flex-1 rounded-md px-2 py-1 text-left">
              <span className="flex items-center gap-2">
                <span className="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  {item.pinned_by_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.pinned_by_name}</span>
                <time className="text-muted-foreground shrink-0 text-xs">
                  {new Date(item.message_created_at).toLocaleDateString()}
                </time>
              </span>
              <span className="mt-2 block line-clamp-3 whitespace-pre-wrap text-sm">
                {item.content || "Attachment"}
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Unpin message by ${item.pinned_by_name}`}
              onClick={async () => {
                await pinService.unpin(item.message_id, scope);
                setItems((current) => current.filter((entry) => entry.id !== item.id));
              }}
            >
              Unpin
            </Button>
          </div>
        )) : (
          <p className="text-muted-foreground text-sm">No pinned messages yet.</p>
        )}
      </div>
    </aside>
  );
}
