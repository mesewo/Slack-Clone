import { NavGroup } from "@/types";

/**
 * Navigation configuration with RBAC support
 *
 * This configuration is used for both the sidebar navigation and Cmd+K bar.
 * Items are organized into groups, each rendered with a SidebarGroupLabel.
 *
 * RBAC Access Control:
 * Each navigation item can have an `access` property that controls visibility
 * based on permissions, plans, features, roles, and organization context.
 *
 * Examples:
 *
 * 1. Require organization:
 *    access: { requireOrg: true }
 *
 * 2. Require specific permission:
 *    access: { requireOrg: true, permission: 'org:teams:manage' }
 *
 * 3. Require specific plan:
 *    access: { plan: 'pro' }
 *
 * 4. Require specific feature:
 *    access: { feature: 'premium_access' }
 *
 * 5. Require specific role:
 *    access: { role: 'admin' }
 *
 * 6. Multiple conditions (all must be true):
 *    access: { requireOrg: true, permission: 'org:teams:manage', plan: 'pro' }
 *
 * Note: The `visible` function is deprecated but still supported for backward compatibility.
 * Use the `access` property for new items.
 */
export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Workspaces",
        url: "/workspaces",
        icon: "workspace",
        isActive: false,
        items: [],
      },
      {
        title: "Chat",
        url: "/home",
        icon: "chat",
        shortcut: ["c", "c"],
        isActive: false,
        items: [],
      },
      {
        title: "Saved items",
        url: "/dashboard/saved",
        icon: "bookmark",
        isActive: false,
        items: [],
      },
    ],
  },
  {
    label: "Elements",
    items: [],
  },
  {
    label: "",
    items: [
      {
        title: "Account",
        url: "#",
        icon: "account",
        isActive: true,
        items: [
          {
            title: "Profile",
            url: "/dashboard/profile",
            icon: "profile",
            shortcut: ["m", "m"],
          },
          {
            title: "Notifications",
            url: "/dashboard/notifications",
            icon: "notification",
            shortcut: ["n", "n"],
          },
          {
            title: "Login",
            shortcut: ["l", "l"],
            url: "/",
            icon: "login",
          },
        ],
      },
    ],
  },
];
