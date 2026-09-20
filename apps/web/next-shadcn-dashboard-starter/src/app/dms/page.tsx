"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { messageService } from "@/features/workspace/services/messageService";
import { workspaceService } from "@/features/workspace/services/workspaceService";

export default function DMsPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void messageService
      .createSelfDM()
      .then(async ({ id }) => {
        const storedWorkspace = window.localStorage.getItem(
          "active_workspace_id",
        );
        const workspaces = await workspaceService.list();
        const workspaceId =
          (storedWorkspace &&
          workspaces.some((item) => item.id === storedWorkspace)
            ? storedWorkspace
            : workspaces[0]?.id) || null;
        if (active && workspaceId) {
          router.replace(`/home/${workspaceId}/dms/${id}?dmOnly=1`);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="text-muted-foreground flex min-h-svh items-center justify-center p-6 text-sm">
      Opening direct messages...
    </div>
  );
}
