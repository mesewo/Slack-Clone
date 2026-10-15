"use client";

import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";
import { MessageComposer } from "@/features/chat/components/message-composer";
import { useChatStore } from "@/features/chat/utils/store";
import type { Attachment, Conversation } from "@/features/chat/utils/types";
import { messageService, type DirectUser } from "@/features/workspace/services/messageService";

type NewMessageComposerProps = { conversations: Conversation[]; onClose: () => void };
type Recipient =
  | { kind: "conversation"; id: string; label: string }
  | { kind: "person"; id: string; label: string; user: DirectUser };
type Option =
  | { key: string; type: "self" | "channel"; conversation: Conversation }
  | { key: string; type: "person"; user: DirectUser };

export function NewMessageComposer({ conversations, onClose }: NewMessageComposerProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const createDM = useChatStore((state) => state.createDM);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const userPresence = useChatStore((state) => state.userPresence);
  const [users, setUsers] = useState<DirectUser[]>([]);
  const [to, setTo] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void messageService.listDMUsers().then((result) => {
      if (!cancelled) setUsers(result);
    }).catch(() => {
      if (!cancelled) setUsers([]);
    });
    return () => { cancelled = true; };
  }, []);

  const options = useMemo<Option[]>(() => {
    const query = to.trim().replace(/^[#@]/, "").toLowerCase();
    const match = (text: string) => !query || text.toLowerCase().includes(query);
    const list: Option[] = [];
    const self = conversations.find((conversation) => conversation.kind === "dm" && conversation.name === "You");
    if (self && match("you")) list.push({ key: self.id, type: "self", conversation: self });
    conversations
      .filter((conversation) => conversation.kind !== "dm" && match(`${conversation.name} ${conversation.title}`))
      .slice(0, 6)
      .forEach((conversation) => list.push({ key: conversation.id, type: "channel", conversation }));
    const matchingUsers = users.filter((user) =>
      match(`${user.display_name} ${user.email}`),
    );
    (query ? matchingUsers : matchingUsers.slice(0, 6))
      .forEach((user) => list.push({ key: user.id, type: "person", user }));
    return list;
  }, [conversations, to, users]);

  const open = focused && !recipient;

  function choose(option: Option) {
    if (option.type === "person") {
      const label = option.user.display_name || option.user.email;
      setRecipient({ kind: "person", id: option.user.id, label, user: option.user });
      setTo(label);
    } else {
      const label = option.type === "self" ? "You" : `#${option.conversation.name}`;
      setRecipient({ kind: "conversation", id: option.conversation.id, label });
      setTo(label);
    }
    setFocused(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(options[active] ?? options[0]);
    } else if (event.key === "Escape") {
      setFocused(false);
    }
  }

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
    setAttachments((current) => current.map((item) => ({ ...item, isUploading: Boolean(item.file) })));
    try {
      let conversationId = recipient.id;
      if (recipient.kind === "person") {
        const existingDM = conversations.find(
          (conversation) => conversation.kind === "dm" && conversation.otherUserId === recipient.user.id,
        );
        conversationId = existingDM?.id ?? (await createDM(recipient.user.id)) ?? "";
      }
      if (!conversationId) throw new Error("Could not open this conversation");
      const uploaded = await Promise.all(
        attachments.filter((attachment) => attachment.file).map((attachment) => messageService.upload(attachment.file!)),
      );
      selectConversation(conversationId);
      await sendMessage(draft, uploaded.map((attachment) => attachment.id));
      router.push(
        conversationId.startsWith("dm:")
          ? `/home/${workspaceId}/dms/${conversationId.slice(3)}`
          : `/home/${workspaceId}/channels/${conversationId}`,
      );
      setAttachments([]);
      onClose();
    } catch {
      setAttachments((current) => current.map((item) => ({ ...item, isUploading: false })));
      toast.error("Couldn't send that message. Try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="relative shrink-0 px-5 pt-5 sm:px-8">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">New message</h1>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:bg-accent rounded-md p-2" aria-label="Close new message">
            <Icons.close className="size-4" />
          </button>
        </div>
        <div className="border-border mt-2 flex items-center gap-3 border-b pb-2">
          <label htmlFor="new-message-recipient" className="text-muted-foreground text-sm">To:</label>
          <input
            id="new-message-recipient"
            value={to}
            onChange={(event) => { setTo(event.target.value); setRecipient(null); setActive(0); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            placeholder="#a-channel, @somebody, or somebody@example.com"
            autoComplete="off"
            autoFocus
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        {open && (
          <div role="listbox" className="border-border bg-popover absolute inset-x-5 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border p-1 shadow-xl sm:inset-x-8">
            {options.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2 text-sm">
                No matching people or conversations.
              </p>
            ) : options.map((option, index) => {
              const isActive = index === active;
              const name = option.type === "person"
                ? option.user.display_name || option.user.email
                : option.type === "self" ? "You" : option.conversation.name;
              const online = option.type === "self" || (option.type === "person" && userPresence[option.user.id] === "active");
              return (
                <button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm", isActive && "bg-accent")}
                >
                  {option.type === "channel" ? (
                    <span className="text-muted-foreground w-5 text-center text-base">#</span>
                  ) : (
                    <span className="bg-primary/15 text-primary flex size-5 items-center justify-center rounded text-[0.6rem] font-bold">
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="font-semibold">{name}</span>
                  {option.type === "self" && <span className="text-muted-foreground">(you)</span>}
                  {online && <span className="size-2 rounded-full bg-emerald-500" />}
                  {isActive && <span className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 text-xs">Enter</span>}
                </button>
              );
            })}
          </div>
        )}
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
          onRemoveAttachment={(id) => setAttachments((current) => current.filter((item) => item.id !== id))}
          isUploading={isUploading}
        />
      </div>
    </div>
  );
}
