"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { workspaceService } from "@/features/workspace/services/workspaceService";
import { apiClient } from "@/lib/axios";

export default function AcceptWorkspaceInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await apiClient.get("/api/auth/verify");
      } catch (cause) {
        const status = (cause as { response?: { status?: number } }).response
          ?.status;
        if (status === 401) {
          const next = encodeURIComponent(`/workspace/join/${token}`);
          router.replace(`/auth/sign-in?next=${next}`);
          return;
        }
        setError("This invite is invalid, expired, or already used.");
        return;
      }

      try {
        const { workspace_id } = await workspaceService.acceptInvite(token);
        router.replace(`/home/${workspace_id}`);
      } catch {
        setError("This invite is invalid, expired, or already used.");
      }
    })();
  }, [router, token]);

  return (
    <div className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
      {error || "Joining workspace..."}
    </div>
  );
}
