import { ChatContainer } from "@/features/messages/components/ChatContainer";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { workspaceId: string; channelId: string };
}): Promise<Metadata> {
  return {
    title: `Channel ${params.channelId}`,
  };
}

export default function ChannelPage({
  params,
}: {
  params: { workspaceId: string; channelId: string };
}) {
  return (
    <div className="min-h-screen p-4">
      {/* Server-side params (debug) */}
      <div className="mb-4 rounded border bg-card p-3">
        <div className="text-sm text-muted-foreground">
          Debug params (server-rendered):
        </div>
        <div className="text-sm">
          workspaceId: {params.workspaceId ?? "undefined"}
        </div>
        <div className="text-sm">
          channelId: {params.channelId ?? "undefined"}
        </div>
      </div>

      {/* ChatContainer is a client component that handles WS and history */}
      <ChatContainer channelId={params.channelId} />
    </div>
  );
}
