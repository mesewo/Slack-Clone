import { redirect } from "next/navigation";

export default async function NotificationsRoute({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`/home/${workspaceId}/activity`);
}
