import { WorkspaceChatView } from "@/features/workspace/components/WorkspaceChatView";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ workspaceId: string; channelId: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  return { title: `Channel ${resolvedParams.channelId}` };
}

export default function ChannelPage({}: {
  params: Promise<{ workspaceId: string; channelId: string }>;
}) {
  return <WorkspaceChatView />;
}
