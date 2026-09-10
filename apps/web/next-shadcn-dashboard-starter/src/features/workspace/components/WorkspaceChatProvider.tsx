"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useChatStore } from "@/features/chat/utils/store";
import { useRealtimeConnection } from "@/features/chat/hooks/use-realtime-connection";

export function WorkspaceChatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const init = useChatStore((state) => state.init);
  const selectedConversationId = useChatStore(
    (state) => state.selectedConversationId,
  );

  useEffect(() => {
    window.localStorage.setItem("active_workspace_id", workspaceId);
    if (user) void init(user.id, workspaceId);
  }, [init, user, workspaceId]);

  useRealtimeConnection(Boolean(user), selectedConversationId);

  return children;
}
