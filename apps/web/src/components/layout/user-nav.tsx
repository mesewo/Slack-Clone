"use client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/lib/auth";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEffect, useState } from "react";

export function UserNav() {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return (
        window.localStorage.getItem("slack_profile_avatar") ||
        window.localStorage.getItem("slack_user_avatar") ||
        ""
      );
    }
    return "";
  });
  const [displayName, setDisplayName] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("slack_profile_display_name") || "Local user";
    }
    return "Local user";
  });

  useEffect(() => {
    const handleAvatarUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail !== undefined) {
        setAvatarUrl(customEvent.detail);
      } else {
        setAvatarUrl(
          window.localStorage.getItem("slack_profile_avatar") ||
            window.localStorage.getItem("slack_user_avatar") ||
            ""
        );
      }
    };
    const handleProfileUpdate = () => {
      const name = window.localStorage.getItem("slack_profile_display_name");
      if (name) setDisplayName(name);
    };

    window.addEventListener("slack:avatar-updated", handleAvatarUpdate);
    window.addEventListener("slack:profile-updated", handleProfileUpdate);
    return () => {
      window.removeEventListener("slack:avatar-updated", handleAvatarUpdate);
      window.removeEventListener("slack:profile-updated", handleProfileUpdate);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      router.replace("/auth/sign-in");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0" />
        }
      >
        <Avatar className="h-8 w-8 rounded-full border border-border/60">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback className="rounded-full bg-primary/20 text-xs font-semibold text-primary">
            {displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" sideOffset={10}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm leading-none font-medium">{displayName}</p>
              <p className="text-muted-foreground text-xs leading-none">
                Active in workspace
              </p>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              const workspaceId = window.localStorage.getItem("active_workspace_id");
              router.push(
                workspaceId
                  ? `/home/${workspaceId}/profile`
                  : "/dashboard/profile"
              );
            }}
          >
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const workspaceId = window.localStorage.getItem("active_workspace_id");
              router.push(
                workspaceId
                  ? `/home/${workspaceId}/notifications`
                  : "/workspaces",
              );
            }}
          >
            Notifications
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
