import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
  return (
    <div className="flex items-center gap-2">
      <Avatar className={className}>
        <AvatarImage src={user?.imageUrl || ""} alt={user?.fullName || ""} />
        <AvatarFallback className="rounded-lg">
          {(user?.fullName || user?.name || user?.email || "CN")
            .slice(0, 2)
            .toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {showInfo && (
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold">
            {user?.fullName || user?.name || "Local user"}
          </span>
          <span className="truncate text-xs">
            {user?.emailAddresses?.[0]?.emailAddress || user?.email || ""}
          </span>
        </div>
      )}
    </div>
  );
}
