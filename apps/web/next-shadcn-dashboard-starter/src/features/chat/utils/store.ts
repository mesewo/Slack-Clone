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
    replyCount: m.reply_count,
  };
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
  };
}

type ChatState = {
  currentUserId: string | null;
  workspace: Workspace | null;
  conversations: Conversation[];
  selectedConversationId: string;
  draft: string;
  loadingMessages: boolean;

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
  setDraft: (text: string) => void;
  sendMessage: (text: string) => Promise<void>;
  addIncomingMessage: (channelId: string, message: ChatMessage) => void;
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
  loadingMessages: false,

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
    const demoSlug = "demo-workspace";
    const demoWorkspace = workspaces.find((w) => w.slug === demoSlug);
    let workspace = demoWorkspace ?? workspaces[0] ?? null;

    if (!workspace) {
      try {
        workspace = await workspaceService.join(demoSlug);
      } catch {
        workspace = await workspaceService.create({
          name: "Demo Workspace",
          slug: demoSlug,
        });
      }
    } else if (!demoWorkspace && workspaces.length > 0) {
      try {
        workspace = await workspaceService.join(demoSlug);
      } catch {
        // Keep the current workspace if the shared join is unavailable.
      }
    }

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

    set({
      workspace,
      conversations,
      selectedConversationId: conversations[0]?.id ?? "",
    });

    if (conversations[0]) {
      get().selectConversation(conversations[0].id);
    }
  },

  selectConversation: (id) => {
    set({ selectedConversationId: id });

    const conversation = get().conversations.find((c) => c.id === id);
    if (!conversation || conversation.messages.length > 0) return; // already loaded

    set({ loadingMessages: true });
    messageService
      .list(id)
      .then((messages) => {
        const currentUserId = get().currentUserId ?? "";
        // REST returns newest-first for pagination; reverse for display order.
        const uiMessages = messages
          .slice()
          .reverse()
          .map((m) => toUIMessage(m, currentUserId));
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, messages: uiMessages } : c,
          ),
          loadingMessages: false,
        }));

        return Promise.all(
          messages.map((message) =>
            messageService.listReactions(id, message.id),
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

  setDraft: (text) => set({ draft: text }),

  sendMessage: async (text) => {
    const channelId = get().selectedConversationId;
    if (!channelId || !text.trim()) return;

    set({ draft: "" });
    // Not added to local state here on purpose: the server broadcasts the
    // new message back over the WebSocket (see useRealtimeConnection),
    // which is the single source of truth for "a message was sent." Adding
    // it here too would show it twice.
    try {
      await messageService.send(channelId, text.trim());
    } catch (error) {
      set({ draft: text });
      console.error("Failed to send message:", error);
    }
  },

  // Called by useRealtimeConnection when a message_created event arrives.
  addIncomingMessage: (channelId, message) => {
    const currentUserId = get().currentUserId ?? "";
    const uiMessage = toUIMessage(message, currentUserId);
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== channelId) return c;
        const isActive = state.selectedConversationId === channelId;
        return {
          ...c,
          messages: [...c.messages, uiMessage],
          unread: isActive ? 0 : c.unread + 1,
        };
      }),
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
      const replies = await messageService.listThreadReplies(
        channelId,
        messageId,
      );
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
      await messageService.addReaction(channelId, messageId, emoji);
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
      await messageService.removeReaction(channelId, messageId);
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
