"use client";

import { useEffect, useState } from "react";
import {
  workspaceService,
  type WorkspaceMember,
} from "@/features/workspace/services/workspaceService";

export function useWorkspaceMembers(workspaceId: string) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void workspaceService
      .listMembers(workspaceId)
      .then((result) => {
        if (!cancelled) setMembers(result.members ?? []);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return { members, loading };
}
