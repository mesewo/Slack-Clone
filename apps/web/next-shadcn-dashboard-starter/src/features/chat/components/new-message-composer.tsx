"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icons } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { MessageComposer } from "@/features/chat/components/message-composer";
import { useChatStore } from "@/features/chat/utils/store";
import type { Attachment, Conversation } from "@/features/chat/utils/types";
import { messageService, type DirectUser } from "@/features/workspace/services/messageService";

type NewMessageComposerProps = {
  conversations: Conversation[];
  onClose: () => void;
};

type Recipient =
  | { kind: "channel"; id: string; label: string }
  | { kind: "person"; id: string; label: string; user: DirectUser };

export function NewMessageComposer({ conversations, onClose }: NewMessageComposerProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const createDM = useChatStore((state) => state.createDM);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const [users, setUsers] = useState<DirectUser[]>([]);
  const [to, setTo] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void messageService
      .listDMUsers()
      .then((result) => {
        if (!cancelled) setUsers(result);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    const query = to.trim().replace(/^#/, "").toLowerCase();
    if (!query || recipient) return { channels: [], people: [] };
    return {
      channels: conversations
        .filter((conversation) => conversation.kind !== "dm")
        .filter((conversation) =>
          `${conversation.name} ${conversation.title}`.toLowerCase().includes(query),
        )
        .slice(0, 6),
      people: users
        .filter((user) =>
          `${user.display_name} ${user.email}`.toLowerCase().includes(query),
        )
        .slice(0, 6),
    };
  }, [conversations, recipient, to, users]);

  const addAttachments = (files: FileList) => {
    setAttachments((current) => [
      ...current,
      ...Array.from(files).map((file) => ({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipient) {
      toast.info("Choose a channel or person first.");
      return;
    }
    if (!draft.trim() && attachments.length === 0) return;

    setIsUploading(true);
    setAttachments((current) =>
      current.map((item) => ({ ...item, isUploading: Boolean(item.file) })),
    );
    try {
      let conversationId = recipient.id;
      if (recipient.kind === "person") {
        const existingDM = conversations.find(
          (conversation) =>
            conversation.kind === "dm" && conversation.otherUserId === recipient.user.id,
        );
        conversationId = existingDM?.id ?? (await createDM(recipient.user.id)) ?? "";
      }
      if (!conversationId) throw new Error("Could not open this conversation");

      const uploaded = await Promise.all(
        attachments
          .filter((attachment) => attachment.file)
          .map((attachment) => messageService.upload(attachment.file!)),
      );
      selectConversation(conversationId);
      await sendMessage(
        draft,
        uploaded.map((attachment) => attachment.id),
      );
      router.push(
        conversationId.startsWith("dm:")
          ? `/home/${workspaceId}/dms/${conversationId.slice(3)}`
          : `/home/${workspaceId}/channels/${conversationId}`,
      );
      setAttachments([]);
      onClose();
    } catch {
      setAttachments((current) =>
        current.map((item) => ({ ...item, isUploading: false })),
      );
      toast.error("Couldn't send that message. Try again.");
    } finally {
      setIsUploading(false);
    }
  }

  function selectChannel(conversation: Conversation) {
    const value: Recipient = {
      kind: "channel",
      id: conversation.id,
      label: `#${conversation.name}`,
    };
    setRecipient(value);
    setTo(value.label);
  }

  function selectPerson(user: DirectUser) {
    const value: Recipient = {
      kind: "person",
      id: user.id,
      label: user.display_name || user.email,
      user,
    };
    setRecipient(value);
    setTo(value.label);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background px-5 py-5 sm:px-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">New message</h1>
            <p className="text-muted-foreground mt-1 text-xs">Choose a recipient to start a conversation</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:bg-accent rounded-md p-2" aria-label="Close new message">
            <Icons.close className="size-4" />
          </button>
        </div>
        <div className="relative flex items-center gap-2">
          <label htmlFor="new-message-recipient" className="text-sm text-muted-foreground">To:</label>
          <Input
            id="new-message-recipient"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setRecipient(null);
            }}
            placeholder="#a-channel, or somebody@example.com"
            autoComplete="off"
            autoFocus
            className="h-9 flex-1"
          />
          {(matches.channels.length > 0 || matches.people.length > 0) && (
            <div className="absolute top-full left-8 z-20 mt-1 max-h-72 w-[min(36rem,calc(100vw-5rem))] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
              {matches.channels.length > 0 && (
                <section>
                  <p className="text-muted-foreground px-3 py-1.5 text-xs font-semibold uppercase">Channels</p>
                  {matches.channels.map((conversation) => (
                    <button key={conversation.id} type="button" onClick={() => selectChannel(conversation)} className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm">
                      <span className="text-muted-foreground">#</span>{conversation.name}
                    </button>
                  ))}
                </section>
              )}
              {matches.people.length > 0 && (
                <section>
                  <p className="text-muted-foreground px-3 py-1.5 text-xs font-semibold uppercase">People</p>
                  {matches.people.map((user) => (
                    <button key={user.id} type="button" onClick={() => selectPerson(user)} className="hover:bg-accent flex w-full flex-col rounded-md px-3 py-2 text-left">
                      <span className="text-sm">{user.display_name || user.email}</span>
                      {user.display_name && <span className="text-muted-foreground text-xs">{user.email}</span>}
                    </button>
                  ))}
                </section>
              )}
            </div>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto" />
      <div className="mt-auto shrink-0 px-5 pb-5 sm:px-8">
        <MessageComposer
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
          contactName={recipient?.label ?? "your conversation"}
          quickReplies={[]}
          attachments={attachments}
          onAddAttachments={addAttachments}
          onRemoveAttachment={(id) =>
            setAttachments((current) => current.filter((item) => item.id !== id))
          }
          isUploading={isUploading}
        />
      </div>
    </div>
  );
}
