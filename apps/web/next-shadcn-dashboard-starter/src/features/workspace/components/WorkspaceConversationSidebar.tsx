"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { useChatStore } from "@/features/chat/utils/store";

export function WorkspaceConversationSidebar() {
  const params = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversations = useChatStore((state) => state.conversations);
  const selectedConversationId = useChatStore(
    (state) => state.selectedConversationId,
  );
  const selectConversation = useChatStore((state) => state.selectConversation);
  const createChannel = useChatStore((state) => state.createChannel);
  const createDM = useChatStore((state) => state.createDM);

  function openConversation(id: string) {
    selectConversation(id);
    const historyKey = `slack_navigation_history:${params.workspaceId}`;
    const entry = {
      id,
      kind: id.startsWith("dm:") ? "dm" : "channel",
      label:
        conversations.find((conversation) => conversation.id === id)?.name ||
        id,
    } as const;
    const previous = JSON.parse(
      window.localStorage.getItem(historyKey) || "[]",
    ) as (typeof entry)[];
    window.localStorage.setItem(
      historyKey,
      JSON.stringify(
        [entry, ...previous.filter((item) => item.id !== id)].slice(0, 12),
      ),
    );
    router.push(
      id.startsWith("dm:")
        ? `/home/${params.workspaceId}/dms/${id.slice(3)}`
        : `/home/${params.workspaceId}/channels/${id}`,
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden p-0">
      <ConversationList
        conversations={conversations}
        selectedId={selectedConversationId}
        onSelect={openConversation}
        onCreateChannel={async (name, type) => {
          await createChannel(name, type);
          toast.success("Channel created");
        }}
        onCreateDM={async (userId) => {
          await createDM(userId);
          toast.success("Direct message opened");
        }}
        dmOnly={searchParams.get("dmOnly") === "1"}
      />
    </div>
  );
}
