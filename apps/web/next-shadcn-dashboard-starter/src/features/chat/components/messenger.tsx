"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChatStore } from "../utils/store";
import type { Attachment } from "../utils/types";
import { useRealtimeConnection } from "../hooks/use-realtime-connection";
import { ConversationList } from "./conversation-list";
import { ConversationSelect } from "./conversation-select";
import { ChatArea } from "./chat-area";

export function Messenger() {
  const { user } = useAuth();
  const {
    conversations,
    selectedConversationId,
    draft,
    init,
    selectConversation,
    setDraft,
    sendMessage,
    getActiveConversation,
  } = useChatStore();

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    if (user) init(user.id);
  }, [user, init]);

  // One shared connection for the session - see use-realtime-connection.ts
  useRealtimeConnection(!!user);

  useEffect(() => {
    setAttachments([]);
  }, [selectedConversationId]);

  const handleAddAttachments = useCallback((files: FileList) => {
    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: "file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      name: file.name,
      size: file.size,
      type: file.type,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!draft.trim() && attachments.length === 0) return;

      // Attachments aren't wired to the backend yet - no upload endpoint
      // exists. Only the text content is actually sent for now.
      sendMessage(draft);
      setAttachments([]);
    },
    [draft, attachments, sendMessage],
  );

  const activeConversation = getActiveConversation();
  if (!activeConversation) return null;

  return (
    <div className="border-border/50 bg-background/70 relative grid h-[calc(100dvh-5.5rem)] w-full grid-rows-[auto,1fr] gap-3 overflow-hidden rounded-2xl border p-3 backdrop-blur-xl sm:gap-4 sm:p-4 lg:[grid-template-columns:30%_1fr] lg:grid-rows-[1fr] lg:gap-4 lg:rounded-3xl lg:p-5">
      <ConversationSelect
        conversations={conversations}
        selectedId={selectedConversationId}
        onSelect={selectConversation}
      />
      <ConversationList
        conversations={conversations}
        selectedId={selectedConversationId}
        onSelect={selectConversation}
      />
      <ChatArea
        conversation={activeConversation}
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={handleSubmit}
        attachments={attachments}
        onAddAttachments={handleAddAttachments}
        onRemoveAttachment={handleRemoveAttachment}
      />
    </div>
  );
}
