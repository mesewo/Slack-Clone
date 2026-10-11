export type SettingsSearchDestination = {
  label: string;
  description: string;
  keywords: string[];
  pathBuilder?: (workspaceId: string) => string;
  action?: "toggle-theme";
};

export const settingsSearchDestinations: SettingsSearchDestination[] = [
  {
    label: "Notifications",
    description: "Manage workspace notifications, mentions, and alerts.",
    keywords: ["notification", "alerts", "mentions"],
    pathBuilder: (workspaceId) => `/home/${workspaceId}/notifications`,
  },
  {
    label: "Admin tools",
    description: "Manage workspace members and administrative settings.",
    keywords: ["billing", "members", "workspace settings", "analytics"],
    pathBuilder: (workspaceId) => `/home/${workspaceId}/admin`,
  },
  {
    label: "Profile",
    description: "Update your account profile and display name.",
    keywords: ["avatar", "display name", "account"],
    pathBuilder: () => "/dashboard/profile",
  },
  {
    label: "Theme",
    description: "Switch between dark and light appearance.",
    keywords: ["dark mode", "light mode", "appearance"],
    action: "toggle-theme",
  },
];
