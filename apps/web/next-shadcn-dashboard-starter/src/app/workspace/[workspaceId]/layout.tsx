import { WorkspaceShell } from "@/features/workspace/components/WorkspaceShell";
import { WorkspaceChatProvider } from "@/features/workspace/components/WorkspaceChatProvider";
import AppShell from "@/components/layout/app-shell";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <WorkspaceChatProvider>
        <WorkspaceShell>{children}</WorkspaceShell>
      </WorkspaceChatProvider>
    </AppShell>
  );
}
