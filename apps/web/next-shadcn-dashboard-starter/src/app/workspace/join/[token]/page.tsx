"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { workspaceService } from "@/features/workspace/services/workspaceService";

export default function AcceptWorkspaceInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void workspaceService
      .acceptInvite(token)
      .then(({ workspace_id }) => router.replace(`/workspace/${workspace_id}`))
      .catch(() =>
        setError("This invite is invalid, expired, or already used."),
      );
  }, [router, token]);

  return (
    <div className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
      {error || "Joining workspace..."}
    </div>
  );
}
