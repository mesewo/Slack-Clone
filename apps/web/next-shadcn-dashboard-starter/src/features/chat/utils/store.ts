import { create } from "zustand";
import type { Attachment, Conversation, Message } from "./types";
import {
  workspaceService,
  type Workspace,
} from "@/features/workspace/services/workspaceService";
import {
  channelService,
  type Channel,
} from "@/features/workspace/services/channelService";
import {
  messageService,
  type ChatMessage,
} from "@/features/workspace/services/messageService";
import type { DirectConversation } from "@/features/workspace/services/messageService";

const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const lastConversationKey = "slack_last_conversation_id";

function apiUrl(path: string): string {
  return path.startsWith("http") ? path : `${apiOrigin}${path}`;
}

// ---- Backend -> UI adapters -----------------------------------------------

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toUIMessage(m: ChatMessage, currentUserId: string): Message {
  const isOwn = m.user_id === currentUserId;
  return {
    id: m.id,
    sender: isOwn ? "user" : "contact",
    author: isOwn ? "You" : m.author_name || "Unknown",
    text: m.content,
    timestamp: formatTime(m.created_at),
    createdAt: m.created_at,
    replyCount: m.reply_count,
    attachments: m.attachments?.map((attachment) => ({
      id: attachment.id,
      name: attachment.filename,
      size: attachment.size_bytes,
      type: attachment.content_type,
      url: apiUrl(attachment.url),
      thumbnailUrl: attachment.thumbnail_url
        ? apiUrl(attachment.thumbnail_url)
        : undefined,
    })),
  };
}

function sortMessages(messages: Message[]): Message[] {
  return messages.slice().sort((left, right) => {
    if (!left.createdAt || !right.createdAt) return 0;
    return (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );
  });
}

function toConversation(channel: Channel, workspaceName: string): Conversation {
  return {
    id: channel.id,
    name: "# " + channel.name,
    title: workspaceName,
    // Channels don't have one online/offline state the way a single contact
    // does - stubbed until per-channel presence rollup is built.
    status: "online",
    // Needs a query against channel_members.last_read_at that doesn't exist
    // yet - stubbed at 0 for now.
    unread: 0,
    initials: initials(channel.name),
    messages: [],
    quickReplies: [],
    autoReplies: [],
    kind: "channel",
  };
}

function toDMConversation(dm: DirectConversation): Conversation {
  return {
    id: `dm:${dm.id}`,
    name: dm.other_display_name || dm.other_email,
    title: "Direct message",
    status: "online",
    unread: 0,
    initials: initials(dm.other_display_name || dm.other_email),
    messages: [],
    quickReplies: [],
    autoReplies: [],
    kind: "dm",
    dmId: dm.id,
    otherUserId: dm.other_user_id,
  };
}

type ChatState = {
  currentUserId: string | null;
  workspace: Workspace | null;
  conversations: Conversation[];
  selectedConversationId: string;
  draft: string;
  drafts: Record<string, string>;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  hasOlderMessages: Record<string, boolean>;

  // Thread panel state
  selectedThreadParentId: string | null;
  threadReplies: Message[];
  loadingThreadReplies: boolean;

  // Presence & Typing state
  userPresence: Record<string, "active" | "away" | "dnd">;
  typingUsers: Record<string, string[]>; // channelId -> [userId, ...]

  // Reactions: messageId -> [{ userId, emoji }, ...]
  messageReactions: Record<string, Array<{ userId: string; emoji: string }>>;

  init: (userId: string) => Promise<void>;
  selectConversation: (id: string) => void;
  loadOlderMessages: () => Promise<void>;
  markConversationRead: (id: string) => Promise<void>;
  setDraft: (text: string) => void;
  createChannel: (name: string, type: "PUBLIC" | "PRIVATE") => Promise<void>;
  createDM: (userId: string) => Promise<void>;
  refreshDMs: () => Promise<void>;
  sendMessage: (text: string, attachmentIds?: string[]) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  addIncomingMessage: (channelId: string, message: ChatMessage) => void;
  updateIncomingMessage: (
    channelId: string,
    messageId: string,
    content: string,
  ) => void;
  removeIncomingMessage: (channelId: string, messageId: string) => void;
  getActiveConversation: () => Conversation | undefined;

  // Thread panel methods
  openThreadPanel: (messageId: string) => Promise<void>;
  closeThreadPanel: () => void;
  addThreadReply: (reply: ChatMessage) => void;

  // Presence & typing methods
  setUserPresence: (userId: string, status: string) => void;
  setTyping: (channelId: string, userId: string, isTyping: boolean) => void;

  // Reaction methods
  addReaction: (
    messageId: string,
    userId: string,
    emoji: string,
  ) => Promise<void>;
  removeReaction: (messageId: string, userId: string) => Promise<void>;
  updateReactionUI: (messageId: string, userId: string, emoji?: string) => void;
};

export const useChatStore = create<ChatState>()((set, get) => ({
  currentUserId: null,
  workspace: null,
  conversations: [],
  selectedConversationId: "",
  draft: "",
  drafts: {},
  loadingMessages: false,
  loadingOlderMessages: false,
  hasOlderMessages: {},

  // Thread panel state
  selectedThreadParentId: null,
  threadReplies: [],
  loadingThreadReplies: false,

  // Presence & Typing state
  userPresence: {},
  typingUsers: {},

  // Reactions
  messageReactions: {},

  // Local testing bootstrap: if the user has no workspace yet, or if they are
  // not in the shared demo workspace, we create/join a shared demo workspace and
  // ensure it has a default channel so two people can land in the same place.
  init: async (userId) => {
    set({ currentUserId: userId });

    const workspaces = (await workspaceService.list()) ?? [];
    let workspace =
      workspaces.find(
        (w) => w.id === window.localStorage.getItem("active_workspace_id"),
      ) ??
      workspaces[0] ??
      null;

    if (!workspace) {
      workspace = await workspaceService.create({ name: "My Workspace" });
    }

    window.localStorage.setItem("active_workspace_id", workspace.id);

    let channels = (await channelService.list(workspace.id)) ?? [];
    if (channels.length === 0) {
      try {
        const generalChannel = await channelService.create({
          workspace_id: workspace.id,
          name: "general",
          type: "PUBLIC",
        });
        channels = [generalChannel];
      } catch {
        // If the default channel already exists, fetch the list instead of
        // failing the entire page boot.
        channels = (await channelService.list(workspace.id)) ?? [];
      }
    }

    const conversations = channels.map((c) =>
      toConversation(c, workspace.name),
    );
    const directMessages = (await messageService.listDMs().catch(() => [])).map(
      toDMConversation,
    );

    const allConversations = [...conversations, ...directMessages];
    const savedConversationId =
      window.localStorage.getItem(lastConversationKey);
    const initialConversationId = allConversations.some(
      (conversation) => conversation.id === savedConversationId,
    )
      ? savedConversationId!
      : "";
    set({
      workspace,
      conversations: allConversations,
      selectedConversationId: initialConversationId,
    });

    const unreadCounts = await Promise.all(
      allConversations.map(async (conversation) => {
        try {
          const unread =
            conversation.kind === "dm"
              ? await messageService.getDMUnread(conversation.dmId!)
              : await messageService.getChannelUnread(conversation.id);
          return [conversation.id, unread] as const;
        } catch {
          return [conversation.id, 0] as const;
        }
      }),
    );
    set((state) => ({
      conversations: state.conversations.map((conversation) => ({
        ...conversation,
        unread: unreadCounts.find(([id]) => id === conversation.id)?.[1] ?? 0,
      })),
    }));

    if (initialConversationId) {
      get().selectConversation(initialConversationId);
    }
  },

  selectConversation: (id) => {
    const previousId = get().selectedConversationId;
    const currentDraft = get().draft;
    set((state) => ({
      selectedConversationId: id,
      draft: state.drafts[id] ?? "",
      drafts:
        previousId && previousId !== id
          ? { ...state.drafts, [previousId]: currentDraft }
          : state.drafts,
    }));
    window.localStorage.setItem(lastConversationKey, id);

    const conversation = get().conversations.find((c) => c.id === id);
    if (!conversation || conversation.messages.length > 0) return; // already loaded

    set({ loadingMessages: true });
    const conversationIsDM = id.startsWith("dm:");
    const messagesPromise = conversationIsDM
      ? messageService.listDMMessages(id.slice(3))
      : messageService.list(id);
    messagesPromise
      .then((messages) => {
        const currentUserId = get().currentUserId ?? "";
        // REST returns newest-first for pagination; reverse for display order.
        const uiMessages = sortMessages(
          messages
            .slice()
            .reverse()
            .map((m) => toUIMessage(m, currentUserId)),
        );
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, messages: uiMessages } : c,
          ),
          loadingMessages: false,
        }));

        return Promise.all(
          messages.map((message) =>
            conversationIsDM
              ? messageService.listDMReactions(id.slice(3), message.id)
              : messageService.listReactions(id, message.id),
          ),
        );
      })
      .then((reactionGroups) => {
        if (!reactionGroups) return;
        set({
          messageReactions: reactionGroups.flat().reduce(
            (all, reaction) => ({
              ...all,
              [reaction.message_id]: [
                ...(all[reaction.message_id] || []),
                { userId: reaction.user_id, emoji: reaction.emoji },
              ],
            }),
            get().messageReactions,
          ),
        });
      })
      .catch(() => set({ loadingMessages: false }));
  },

  loadOlderMessages: async () => {
    const state = get();
    const conversation = state.conversations.find(
      (item) => item.id === state.selectedConversationId,
    );
    if (
      !conversation ||
      state.loadingOlderMessages ||
      conversation.messages.length === 0
    )
      return;
    const oldest = conversation.messages[0];
    if (state.hasOlderMessages[conversation.id] === false) return;
    set({ loadingOlderMessages: true });
    try {
      const before = oldest.createdAt;
      const items =
        conversation.kind === "dm"
          ? await messageService.listDMMessagesPage(conversation.dmId!, {
              before,
              limit: 50,
            })
          : await messageService.list(conversation.id, { before, limit: 50 });
      const currentUserId = get().currentUserId ?? "";
      const older = items
        .slice()
        .reverse()
        .map((item) => toUIMessage(item, currentUserId));
      set((current) => ({
        conversations: current.conversations.map((item) =>
          item.id === conversation.id
            ? { ...item, messages: sortMessages([...older, ...item.messages]) }
            : item,
        ),
        hasOlderMessages: {
          ...current.hasOlderMessages,
          [conversation.id]: items.length >= 50,
        },
        loadingOlderMessages: false,
      }));
    } catch {
      set({ loadingOlderMessages: false });
    }
  },

  markConversationRead: async (id) => {
    const conversation = get().conversations.find((item) => item.id === id);
    if (!conversation) return;
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === id ? { ...conversation, unread: 0 } : conversation,
      ),
    }));
    try {
      if (conversation.kind === "dm") {
        await messageService.markDMRead(conversation.dmId!);
      } else {
        await messageService.markChannelRead(conversation.id);
      }
    } catch (error) {
      console.error("Failed to persist read state:", error);
    }
  },

  setDraft: (text) => {
    const conversationId = get().selectedConversationId;
    set((state) => ({
      draft: text,
      drafts: conversationId
        ? { ...state.drafts, [conversationId]: text }
        : state.drafts,
    }));
  },

  createChannel: async (name, type) => {
    const workspace = get().workspace;
    if (!workspace || !name.trim()) return;
    const channel = await channelService.create({
      workspace_id: workspace.id,
      name: name.trim().replace(/^#/, "").trim(),
      type,
    });
    const conversation = toConversation(channel, workspace.name);
    set((state) => ({
      conversations: [...state.conversations, conversation],
      selectedConversationId: channel.id,
    }));
    window.localStorage.setItem(lastConversationKey, channel.id);
  },

  createDM: async (userId) => {
    const result = await messageService.createDM(userId);
    const dms = await messageService.listDMs();
    const dm = dms.find((item) => item.id === result.id);
    if (!dm) return;
    const conversation = toDMConversation(dm);
    set((state) => ({
      conversations: [
        ...state.conversations.filter((item) => item.id !== conversation.id),
        conversation,
      ],
      selectedConversationId: conversation.id,
    }));
    window.localStorage.setItem(lastConversationKey, conversation.id);
  },

  refreshDMs: async () => {
    const directMessages = (await messageService.listDMs()).map(
      toDMConversation,
    );
    set((state) => ({
      conversations: [
        ...state.conversations.filter((item) => item.kind !== "dm"),
        ...directMessages.map((conversation) =>
          state.conversations.find((item) => item.id === conversation.id)
            ? {
                ...conversation,
                messages:
                  state.conversations.find(
                    (item) => item.id === conversation.id,
                  )?.messages ?? [],
                unread:
                  state.conversations.find(
                    (item) => item.id === conversation.id,
                  )?.unread ?? 0,
              }
            : conversation,
        ),
      ],
    }));
  },

  sendMessage: async (text, attachmentIds = []) => {
    const channelId = get().selectedConversationId;
    if (!channelId || (!text.trim() && attachmentIds.length === 0)) return;

    set((state) => ({
      draft: "",
      drafts: { ...state.drafts, [channelId]: "" },
    }));
    // Channel messages come back over the WebSocket; DM sends are inserted
    // locally through addIncomingMessage, which also deduplicates broadcasts.
    try {
      if (channelId.startsWith("dm:")) {
        const sent = await messageService.sendDM(
          channelId.slice(3),
          text.trim(),
          attachmentIds,
        );
        get().addIncomingMessage(channelId, {
          id: sent.id,
          channel_id: channelId,
          user_id: sent.user_id,
          content: sent.content,
          created_at: sent.created_at,
          updated_at: sent.updated_at,
          deleted_at: sent.deleted_at,
          parent_id: null,
          reply_count: 0,
          author_name: "You",
        });
      } else {
        await messageService.send(channelId, text.trim(), attachmentIds);
      }
    } catch (error) {
      set((state) => ({
        draft: text,
        drafts: { ...state.drafts, [channelId]: text },
      }));
      console.error("Failed to send message:", error);
    }
  },

  editMessage: async (messageId, content) => {
    const channelId = get().selectedConversationId;
    if (!channelId || !content.trim()) return;

    const targetConversation = get().conversations.find(
      (conversation) => conversation.id === channelId,
    );
    const originalMessage = targetConversation?.messages.find(
      (message) => message.id === messageId,
    );
    if (!originalMessage) return;

    const originalText = originalMessage.text;
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === channelId
          ? {
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === messageId
                  ? { ...message, text: content.trim() }
                  : message,
              ),
            }
          : conversation,
      ),
    }));

    try {
      await messageService.edit(channelId, messageId, content.trim());
    } catch (error) {
      set((state) => ({
        conversations: state.conversations.map((conversation) =>
          conversation.id === channelId
            ? {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === messageId
                    ? { ...message, text: originalText }
                    : message,
                ),
              }
            : conversation,
        ),
      }));
      console.error("Failed to edit message:", error);
    }
  },

  deleteMessage: async (messageId) => {
    const channelId = get().selectedConversationId;
    if (!channelId) return;

    const conversation = get().conversations.find(
      (item) => item.id === channelId,
    );
    const message = conversation?.messages.find(
      (item) => item.id === messageId,
    );
    if (!message || message.sender !== "user") return;

    get().removeIncomingMessage(channelId, messageId);
    try {
      await messageService.delete(channelId, messageId);
    } catch (error) {
      set((state) => ({
        conversations: state.conversations.map((item) =>
          item.id === channelId
            ? {
                ...item,
                messages: sortMessages([...item.messages, message]),
              }
            : item,
        ),
      }));
      console.error("Failed to delete message:", error);
    }
  },

  // Called by useRealtimeConnection when a message_created event arrives.
  addIncomingMessage: (channelId, message) => {
    const currentUserId = get().currentUserId ?? "";
    const uiMessage = toUIMessage(message, currentUserId);
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== channelId) return c;
        if (c.messages.some((existing) => existing.id === message.id)) return c;
        const isOwnMessage = message.user_id === currentUserId;
        return {
          ...c,
          messages: sortMessages([...c.messages, uiMessage]),
          unread: isOwnMessage ? c.unread : c.unread + 1,
        };
      }),
    }));
  },

  updateIncomingMessage: (channelId, messageId, content) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === channelId
          ? {
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === messageId
                  ? { ...message, text: content }
                  : message,
              ),
            }
          : conversation,
      ),
      threadReplies: state.threadReplies.map((message) =>
        message.id === messageId ? { ...message, text: content } : message,
      ),
    }));
  },

  removeIncomingMessage: (channelId, messageId) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === channelId
          ? {
              ...conversation,
              messages: conversation.messages.filter(
                (message) => message.id !== messageId,
              ),
            }
          : conversation,
      ),
      messageReactions: Object.fromEntries(
        Object.entries(state.messageReactions).filter(
          ([id]) => id !== messageId,
        ),
      ),
    }));
  },

  getActiveConversation: () => {
    const state = get();
    return state.conversations.find(
      (c) => c.id === state.selectedConversationId,
    );
  },

  // Thread panel methods
  openThreadPanel: async (messageId: string) => {
    const channelId = get().selectedConversationId;
    if (!channelId) return;

    set({ selectedThreadParentId: messageId, loadingThreadReplies: true });

    try {
      const replies = channelId.startsWith("dm:")
        ? await messageService.listDMThreadReplies(
            channelId.slice(3),
            messageId,
          )
        : await messageService.listThreadReplies(channelId, messageId);
      const currentUserId = get().currentUserId ?? "";
      const uiReplies = replies.map((m) => toUIMessage(m, currentUserId));
      set({ threadReplies: uiReplies, loadingThreadReplies: false });
    } catch {
      set({ loadingThreadReplies: false });
    }
  },

  closeThreadPanel: () => {
    set({
      selectedThreadParentId: null,
      threadReplies: [],
      loadingThreadReplies: false,
    });
  },

  addThreadReply: (reply: ChatMessage) => {
    const currentUserId = get().currentUserId ?? "";
    const uiReply = toUIMessage(reply, currentUserId);
    set((state) => {
      if (state.threadReplies.some((item) => item.id === uiReply.id)) {
        return state;
      }

      return {
        threadReplies: [...state.threadReplies, uiReply],
        conversations: state.conversations.map((conversation) => ({
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === reply.parent_id
              ? { ...message, replyCount: (message.replyCount ?? 0) + 1 }
              : message,
          ),
        })),
      };
    });
  },

  // Presence & typing methods
  setUserPresence: (userId: string, status: string) => {
    set((state) => ({
      userPresence: { ...state.userPresence, [userId]: status as any },
    }));
  },

  setTyping: (channelId: string, userId: string, isTyping: boolean) => {
    set((state) => {
      const current = state.typingUsers[channelId] || [];
      const updated = isTyping
        ? Array.from(new Set([...current, userId]))
        : current.filter((id) => id !== userId);

      return {
        typingUsers: { ...state.typingUsers, [channelId]: updated },
      };
    });
  },

  // Reaction methods
  addReaction: async (messageId: string, userId: string, emoji: string) => {
    const channelId = get().selectedConversationId;
    if (!channelId) return;

    // Optimistic update
    get().updateReactionUI(messageId, userId, emoji);

    try {
      if (channelId.startsWith("dm:")) {
        await messageService.addDMReaction(
          channelId.slice(3),
          messageId,
          emoji,
        );
      } else {
        await messageService.addReaction(channelId, messageId, emoji);
      }
    } catch (e) {
      // Revert on error
      get().updateReactionUI(messageId, userId);
      console.error("Failed to add reaction:", e);
    }
  },

  removeReaction: async (messageId: string, userId: string) => {
    const channelId = get().selectedConversationId;
    if (!channelId) return;

    // Optimistic update
    get().updateReactionUI(messageId, userId);

    try {
      if (channelId.startsWith("dm:")) {
        await messageService.removeDMReaction(channelId.slice(3), messageId);
      } else {
        await messageService.removeReaction(channelId, messageId);
      }
    } catch (e) {
      console.error("Failed to remove reaction:", e);
    }
  },

  updateReactionUI: (messageId: string, userId: string, emoji?: string) => {
    set((state) => {
      const reactions = state.messageReactions[messageId] || [];
      let updated = reactions.filter((r) => r.userId !== userId);

      if (emoji) {
        updated = [...updated, { userId, emoji }];
      }

      return {
        messageReactions: {
          ...state.messageReactions,
          [messageId]: updated,
        },
      };
    });
  },
}));
