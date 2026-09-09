import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEffect, useState } from "react";
import { productivityService } from "@/features/workspace/services/productivityService";

interface UserAvatarProfileProps {
  className?: string;
  showInfo?: boolean;
  user: {
    imageUrl?: string;
    fullName?: string | null;
    emailAddresses?: Array<{ emailAddress: string }>;
    email?: string;
    name?: string;
  } | null;
}

export function UserAvatarProfile({
  className,
  showInfo = false,
  user,
}: UserAvatarProfileProps) {
  const [localAvatar, setLocalAvatar] = useState("");
  const [localName, setLocalName] = useState("");

  useEffect(() => {
    void productivityService
      .getProfile()
      .then((profile) => {
        setLocalAvatar(profile.avatar_url);
        setLocalName(profile.display_name);
      })
      .catch(() => {
        setLocalAvatar(
          window.localStorage.getItem("slack_profile_avatar") || "",
        );
        setLocalName(
          window.localStorage.getItem("slack_profile_display_name") || "",
        );
      });
  }, []);

  return (
    <div className="flex items-center gap-2">
      <Avatar className={className}>
        <AvatarImage
          src={localAvatar || user?.imageUrl || ""}
          alt={user?.fullName || ""}
        />
        <AvatarFallback className="rounded-lg">
          {(user?.fullName || user?.name || user?.email || "CN")
            .slice(0, 2)
            .toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {showInfo && (
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold">
            {localName || user?.fullName || user?.name || "Local user"}
          </span>
          <span className="truncate text-xs">
            {user?.emailAddresses?.[0]?.emailAddress || user?.email || ""}
          </span>
        </div>
      )}
    </div>
  );
}
