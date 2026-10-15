"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useChatStore } from "@/features/chat/utils/store";
import { WorkspaceLoading } from "@/components/layout/workspace-loading";
import {
  RealtimeTypingProvider,
  useRealtimeConnection,
} from "@/features/chat/hooks/use-realtime-connection";

export function WorkspaceChatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user, loading: authLoading } = useAuth();
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const init = useChatStore((state) => state.init);
  const selectedConversationId = useChatStore(
    (state) => state.selectedConversationId,
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setWorkspaceReady(true);
      return;
    }

    let cancelled = false;
    setWorkspaceReady(false);
    window.localStorage.setItem("active_workspace_id", workspaceId);
    void init(user.id, workspaceId).finally(() => {
      if (!cancelled) setWorkspaceReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, init, user, workspaceId]);

  const { sendTyping } = useRealtimeConnection(
    Boolean(user),
    selectedConversationId,
  );

  if (!workspaceReady) return <WorkspaceLoading />;

  return (
    <RealtimeTypingProvider sendTyping={sendTyping}>
      {children}
    </RealtimeTypingProvider>
  );
}
