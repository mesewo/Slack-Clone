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

  init: (userId: string) => Promise<void>;
  selectConversation: (id: string) => void;
  setDraft: (text: string) => void;
  sendMessage: (text: string) => Promise<void>;
  addIncomingMessage: (channelId: string, message: ChatMessage) => void;
  getActiveConversation: () => Conversation | undefined;
};

export const useChatStore = create<ChatState>()((set, get) => ({
  currentUserId: null,
  workspace: null,
  conversations: [],
  selectedConversationId: "",
  draft: "",
  loadingMessages: false,

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
      workspace = await workspaceService.create({
        name: "Demo Workspace",
        slug: demoSlug,
      });
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
    await messageService.send(channelId, text.trim());
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
}));
