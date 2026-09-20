"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { UserAvatarProfile } from "@/components/user-avatar-profile";
import { navGroups } from "@/config/nav-config";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useFilteredNavGroups } from "@/hooks/use-nav";
import { logout } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Icons } from "../icons";
import { OrgSwitcher } from "../org-switcher";
import { toast } from "sonner";
import { ThemeModeToggle } from "../themes/theme-mode-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "@/lib/utils";

export default function AppSidebar() {
  const pathname = usePathname();
  const isWorkspaceRoute = pathname.startsWith("/home");
  const { isOpen } = useMediaQuery();
  const router = useRouter();
  const { user } = useAuth();
  const activeWorkspaceId =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("active_workspace_id");
  const organization = null;
  const filteredGroups = useFilteredNavGroups(navGroups);
  const sidebarGroups = filteredGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.title === "Profile"),
    }))
    .filter((group) => group.items.length > 0);

  React.useEffect(() => {
    // Side effects based on sidebar state changes
  }, [isOpen]);

  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      router.replace("/auth/sign-in");
    }
  };

  return (
    <Sidebar
      collapsible="none"
      className={cn(
        "w-[4.5rem] border-sidebar-border/80 text-sidebar-foreground shadow-[inset_-1px_0_0_rgba(148,163,184,0.12)]",
        isWorkspaceRoute ? "bg-[var(--chat-sidebar-bg)]" : "bg-sidebar",
      )}
    >
      <SidebarHeader
        className={cn(
          "border-sidebar-border/70 px-2 py-3",
          isWorkspaceRoute ? "bg-[var(--chat-sidebar-bg)]" : "bg-sidebar/90",
        )}
      >
        <OrgSwitcher />
      </SidebarHeader>
      <SidebarContent
        className={cn(
          "flex-1 overflow-x-hidden px-1 pb-0 pt-1",
          isWorkspaceRoute ? "bg-[var(--chat-sidebar-bg)]" : "bg-sidebar",
        )}
      >
        <SidebarGroup className="py-0">
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Home"
                className="h-auto flex-col gap-1 py-2"
                onClick={() => {
                  const last = activeWorkspaceId
                    ? window.localStorage.getItem(
                        `slack_last_conversation_id:${activeWorkspaceId}`,
                      )
                    : null;
                  router.push(
                    activeWorkspaceId && last
                      ? last.startsWith("dm:")
                        ? `/home/${activeWorkspaceId}/dms/${last.slice(3)}`
                        : `/home/${activeWorkspaceId}/channels/${last}`
                      : "/workspaces",
                  );
                }}
              >
                <Icons.home className="size-6" />
                <span className="text-center text-[0.64rem] font-medium leading-none">
                  Home
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Direct messages"
                className="h-auto flex-col gap-1 py-2"
                render={<Link href="/dms" aria-label="Direct messages" />}
              >
                <Icons.chat className="size-6" />
                <span className="text-center text-[0.64rem] font-medium leading-none">
                  DMs
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Activity"
                className="h-auto flex-col gap-1 py-2"
                render={<Link href="/activity" aria-label="Activity" />}
              >
                <Icons.activity className="size-6" />
                <span className="text-center text-[0.64rem] font-medium leading-none">
                  Activity
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="More"
                className="h-auto flex-col gap-1 py-2"
                onClick={() =>
                  toast.info("More workspace tools are coming soon.")
                }
              >
                <Icons.dots className="size-6" />
                <span className="text-center text-[0.64rem] font-medium leading-none">
                  More
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Admin"
                className="h-auto flex-col gap-1 py-2"
                onClick={() =>
                  activeWorkspaceId
                    ? router.push(`/home/${activeWorkspaceId}/admin`)
                    : toast.info("Open a workspace first.")
                }
              >
                <Icons.settings className="size-6" />
                <span className="text-center text-[0.64rem] font-medium leading-none">
                  Admin
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Popover>
                <PopoverTrigger
                  render={
                    <SidebarMenuButton
                      tooltip="Create"
                      className="h-auto flex-col gap-1 py-2"
                    />
                  }
                >
                  <Icons.add className="size-6" />
                  <span className="text-center text-[0.64rem] font-medium leading-none">
                    Create
                  </span>
                </PopoverTrigger>
                <PopoverContent side="right" align="start" className="w-64 p-1">
                  {[
                    ["Message", () => router.push("/dms")],
                    [
                      "Channel",
                      () =>
                        router.push(
                          activeWorkspaceId
                            ? `/home/${activeWorkspaceId}`
                            : "/home",
                        ),
                    ],
                    ["Huddle", () => toast.info("Huddles are coming soon.")],
                    ["Canvas", () => toast.info("Canvas is coming soon.")],
                    ["List", () => toast.info("Lists are coming soon.")],
                    [
                      "Workflow",
                      () => toast.info("Workflows are coming soon."),
                    ],
                  ].map(([label, action]) => (
                    <button
                      key={label as string}
                      type="button"
                      onClick={action as () => void}
                      className="hover:bg-accent flex w-full items-center rounded-md px-3 py-2 text-left text-sm"
                    >
                      {label as string}
                    </button>
                  ))}
                  <div className="border-border my-1 border-t" />
                  <button
                    type="button"
                    onClick={() =>
                      activeWorkspaceId
                        ? router.push(`/home/${activeWorkspaceId}/admin`)
                        : toast.info("Open a workspace first.")
                    }
                    className="hover:bg-accent flex w-full items-center rounded-md px-3 py-2 text-left text-sm"
                  >
                    Invite people
                  </button>
                </PopoverContent>
              </Popover>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        {sidebarGroups.map((group) => (
          <SidebarGroup key={group.label || "ungrouped"} className="py-0">
            {group.label && (
              <SidebarGroupLabel className="text-sidebar-foreground/60 px-2 text-[0.68rem] font-semibold tracking-[0.2em] uppercase">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon ? Icons[item.icon] : Icons.logo;
                return item?.items && item?.items?.length > 0 ? (
                  <Collapsible
                    key={item.title}
                    defaultOpen={item.isActive}
                    render={<SidebarMenuItem />}
                  >
                    <CollapsibleTrigger
                      render={
                        <SidebarMenuButton
                          tooltip={item.title}
                          isActive={pathname === item.url}
                          className="group/collapsible hover:bg-sidebar-accent/80 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                        />
                      }
                    >
                      {item.icon && <Icon />}
                      <span>{item.title}</span>
                      <Icons.chevronRight className="ml-auto transition-transform duration-200 group-data-panel-open/collapsible:rotate-90" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              render={
                                <Link
                                  href={subItem.url}
                                  aria-label={subItem.title}
                                />
                              }
                              onClick={() => router.push(subItem.url)}
                              isActive={pathname === subItem.url}
                              className="hover:bg-sidebar-accent/80 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                            >
                              <span>{subItem.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link href={item.url} aria-label={item.title} />}
                      onClick={() => router.push(item.url)}
                      tooltip={item.title}
                      isActive={pathname === item.url}
                      className="hover:bg-sidebar-accent/80 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter
        className={cn(
          "mt-auto min-h-0 border-t p-0 pb-1",
          isWorkspaceRoute
            ? "border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)]"
            : "border-sidebar-border/70 bg-sidebar/90",
        )}
      >
        <SidebarMenu className="gap-0">
          <SidebarMenuItem className="flex items-center justify-center px-1">
            <ThemeModeToggle />
          </SidebarMenuItem>
          <SidebarMenuItem className="p-0">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground hover:bg-sidebar-accent/80" />
                }
              >
                {user && (
                  <UserAvatarProfile
                    className="h-9 w-9 rounded-lg"
                    showInfo={false}
                    user={user}
                  />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--anchor-width) min-w-56 rounded-xl border border-border/70 bg-popover shadow-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="px-1 py-1.5">
                      {user && (
                        <UserAvatarProfile
                          className="h-8 w-8 rounded-lg"
                          showInfo
                          user={user}
                        />
                      )}
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />

                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => router.push("/dashboard/profile")}
                  >
                    <Icons.account className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/dashboard/notifications")}
                  >
                    <Icons.notification className="mr-2 h-4 w-4" />
                    Notifications
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <Icons.logout aria-hidden className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
