"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  channelService,
  type ChannelMember,
} from "@/features/workspace/services/channelService";
import {
  messageService,
  type DirectUser,
} from "@/features/workspace/services/messageService";
import { PresenceIndicator } from "./PresenceIndicator";
import { useChatStore } from "../utils/store";

export function ChannelMembersPanel({
  channelId,
  canManage,
  onClose,
}: {
  channelId: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const userPresence = useChatStore((state) => state.userPresence);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [users, setUsers] = useState<DirectUser[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setMembers(await channelService.listMembers(channelId));
      if (canManage) setUsers(await messageService.listDMUsers());
    } catch {
      setError("Unable to load channel members.");
    }
  }

  useEffect(() => {
    void load();
  }, [channelId, canManage]);

  async function addMember() {
    if (!selectedUser) return;
    try {
      await channelService.addMember(channelId, selectedUser);
      setSelectedUser("");
      await load();
    } catch {
      setError("Unable to add channel member.");
    }
  }

  async function removeMember(userId: string) {
    try {
      await channelService.removeMember(channelId, userId);
      setMembers((current) =>
        current.filter((member) => member.user_id !== userId),
      );
    } catch {
      setError("Unable to remove channel member.");
    }
  }

  return (
    <aside className="border-border bg-background absolute right-0 top-14 z-30 flex h-[calc(100%-3.5rem)] w-80 flex-col border-l shadow-xl">
      <div className="border-border flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">Channel members</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close channel members"
        >
          <IconX className="size-4" />
        </Button>
      </div>
      {error && <p className="text-destructive px-4 pt-3 text-xs">{error}</p>}
      {canManage && (
        <div className="flex gap-2 p-4">
          <select
            value={selectedUser}
            onChange={(event) => setSelectedUser(event.target.value)}
            className="bg-background min-w-0 flex-1 rounded border px-2 text-xs"
            aria-label="Select workspace member"
          >
            <option value="">Add member...</option>
            {users
              .filter(
                (user) => !members.some((member) => member.user_id === user.id),
              )
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name || user.email}
                </option>
              ))}
          </select>
          <Button
            size="sm"
            onClick={() => void addMember()}
            disabled={!selectedUser}
          >
            Add
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-4">
        {members.map((member) => (
          <div
            key={member.user_id}
            className="flex items-center gap-2 rounded px-2 py-2 hover:bg-muted"
          >
            <div className="bg-primary/15 text-primary flex size-7 items-center justify-center rounded text-xs">
              {member.display_name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{member.display_name}</p>
              <p className="text-muted-foreground truncate text-xs">
                {member.email}
              </p>
              <PresenceIndicator
                state={
                  member.presence_status === "dnd"
                    ? "dnd"
                    : userPresence[member.user_id] ||
                      (member.presence_status === "active" ||
                      member.presence_status === "away"
                        ? member.presence_status
                        : "offline")
                }
                customStatus={member.presence_status}
              />
            </div>
            {canManage && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => void removeMember(member.user_id)}
                aria-label={`Remove ${member.display_name}`}
              >
                <IconX className="text-destructive size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
