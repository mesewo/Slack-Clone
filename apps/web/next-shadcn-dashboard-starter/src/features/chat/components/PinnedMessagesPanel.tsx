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
    <aside className="border-border bg-background fixed inset-y-14 right-0 z-50 flex w-[min(22rem,90vw)] flex-col border-l shadow-xl">
      <div className="border-border flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">Pinned messages</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close pinned messages">
          <IconX className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {error ? (
          <p className="text-muted-foreground text-sm">Unable to load pinned messages.</p>
        ) : items.length ? items.map((item) => (
          <button key={item.id} type="button" onClick={() => jumpToMessage(item.message_id)} className="border-border hover:bg-muted block w-full rounded-lg border p-3 text-left">
            <p className="line-clamp-3 whitespace-pre-wrap text-sm">{item.content || "Attachment"}</p>
            <p className="text-muted-foreground mt-2 text-xs">Pinned by {item.pinned_by_name} · {new Date(item.created_at).toLocaleDateString()}</p>
            <span className="text-primary mt-2 block text-xs">Jump to message</span>
          </button>
        )) : (
          <p className="text-muted-foreground text-sm">No pinned messages yet.</p>
        )}
      </div>
    </aside>
  );
}
