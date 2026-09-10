"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { IconShield, IconTrash } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  workspaceService,
  type WorkspaceMember,
} from "@/features/workspace/services/workspaceService";

export default function WorkspaceAdminPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [currentRole, setCurrentRole] = useState<
    WorkspaceMember["role"] | null
  >(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function loadMembers() {
    try {
      const result = await workspaceService.listMembers(workspaceId);
      setCurrentRole(result.role);
      setMembers(result.members);
    } catch {
      setError("You do not have access to workspace administration.");
    }
  }

  useEffect(() => {
    void loadMembers();
  }, [workspaceId]);

  async function changeRole(userId: string, role: WorkspaceMember["role"]) {
    setBusyUserId(userId);
    setError(null);
    try {
      const updated = await workspaceService.updateMemberRole(
        workspaceId,
        userId,
        role,
      );
      setMembers((current) =>
        current.map((member) =>
          member.user_id === userId
            ? { ...member, role: updated.role }
            : member,
        ),
      );
    } catch {
      setError("The member role could not be updated.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeMember(userId: string) {
    setBusyUserId(userId);
    setError(null);
    try {
      await workspaceService.removeMember(workspaceId, userId);
      setMembers((current) =>
        current.filter((member) => member.user_id !== userId),
      );
    } catch {
      setError("The member could not be removed.");
    } finally {
      setBusyUserId(null);
    }
  }

  if (currentRole === "MEMBER") {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Workspace administration</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Only workspace owners and admins can manage members.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <div>
        <div className="flex items-center gap-2">
          <IconShield className="size-5" />
          <h1 className="text-2xl font-semibold">Workspace administration</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage workspace members and roles.
        </p>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="border-border divide-border overflow-hidden rounded-lg border divide-y">
        {members.map((member) => {
          const isOwner = member.role === "OWNER";
          const canEdit =
            currentRole === "OWNER" ||
            (currentRole === "ADMIN" && !isOwner && member.role !== "ADMIN");
          return (
            <div
              key={member.user_id}
              className="flex flex-wrap items-center gap-4 p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{member.display_name}</p>
                <p className="text-muted-foreground truncate text-sm">
                  {member.email}
                </p>
              </div>
              <Badge variant={isOwner ? "default" : "secondary"}>
                {member.role}
              </Badge>
              {canEdit && (
                <select
                  aria-label={`Role for ${member.display_name}`}
                  value={member.role}
                  disabled={busyUserId === member.user_id}
                  onChange={(event) =>
                    void changeRole(
                      member.user_id,
                      event.target.value as WorkspaceMember["role"],
                    )
                  }
                  className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                  {currentRole === "OWNER" && (
                    <option value="OWNER">Owner</option>
                  )}
                </select>
              )}
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busyUserId === member.user_id}
                  onClick={() => void removeMember(member.user_id)}
                  aria-label={`Remove ${member.display_name}`}
                >
                  <IconTrash className="text-destructive size-4" />
                </Button>
              )}
            </div>
          );
        })}
        {members.length === 0 && (
          <p className="text-muted-foreground p-6 text-sm">No members found.</p>
        )}
      </div>
    </div>
  );
}
