import { WorkspaceShell } from "@/features/workspace/components/WorkspaceShell";
import { WorkspaceChatProvider } from "@/features/workspace/components/WorkspaceChatProvider";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceChatProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </WorkspaceChatProvider>
  );
}
