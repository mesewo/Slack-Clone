"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { channelService } from "@/features/workspace/services/channelService";

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const lastVisited = window.localStorage.getItem(
      `slack_last_conversation_id:${workspaceId}`,
    );
    if (lastVisited) {
      router.replace(
        lastVisited.startsWith("dm:")
          ? `/home/${workspaceId}/dms/${lastVisited.slice(3)}`
          : `/home/${workspaceId}/channels/${lastVisited}`,
      );
      return () => {
        active = false;
      };
    }
    channelService
      .list(workspaceId)
      .then((channels) => {
        if (!active) return;
        if (channels[0]) {
          router.replace(`/home/${workspaceId}/channels/${channels[0].id}`);
        } else {
          setError("This workspace has no channels yet.");
        }
      })
      .catch(() => {
        if (active) setError("Unable to load workspace channels.");
      });

    return () => {
      active = false;
    };
  }, [router, workspaceId]);

  return (
    <div className="text-muted-foreground flex min-h-svh items-center justify-center p-6 text-sm">
      {error || "Opening workspace..."}
    </div>
  );
}
