import { WorkspaceChatView } from "@/features/workspace/components/WorkspaceChatView";
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
  return <WorkspaceChatView />;
}
