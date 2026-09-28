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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Icons } from "../icons";
import { OrgSwitcher } from "../org-switcher";
import { toast } from "sonner";
import { ThemeModeToggle } from "../themes/theme-mode-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "@/lib/utils";
import { IconX } from "@tabler/icons-react";
import { WorkspaceFilesDialog } from "@/features/workspace/components/WorkspaceFilesDialog";

const railBtn = "group/rail h-auto flex-col gap-1 py-1.5 hover:bg-transparent";
const railIcon = (active?: boolean) =>
  cn("flex size-9 items-center justify-center rounded-lg transition-colors group-hover/rail:bg-white/15", active && "bg-white/25");
const railLabel = "text-[11px] font-semibold leading-none";

export default function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isWorkspaceRoute = pathname.startsWith("/home");
  const { isOpen } = useMediaQuery();
  const router = useRouter();
  const { user } = useAuth();
  const routeWorkspaceId = pathname.match(/^\/home\/([^/]+)/)?.[1] ?? null;
  const [createOpen, setCreateOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const activeWorkspaceId =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("active_workspace_id");
  const activityPath = routeWorkspaceId || activeWorkspaceId
    ? `/home/${routeWorkspaceId || activeWorkspaceId}/activity`
    : "/workspaces";
  // Determine selection from the URL so server and first client render agree;
  // localStorage is only available on the client and can otherwise cause a
  // hydration mismatch on workspace routes.
  const isActivityActive = Boolean(
    routeWorkspaceId && pathname === `/home/${routeWorkspaceId}/activity`,
  );
  const isDmActive = /\/dms(?:\/|$)/.test(pathname) || searchParams.get("dmOnly") === "1";
  const isHomeActive = Boolean(
    routeWorkspaceId &&
      searchParams.get("dmOnly") !== "1" &&
      (pathname === `/home/${routeWorkspaceId}` ||
        pathname.startsWith(`/home/${routeWorkspaceId}/channels/`)),
  );
  const openDirectMessages = () => {
    if (!activeWorkspaceId) {
      router.push("/workspaces");
      return;
    }
    const last = window.localStorage.getItem(
      `slack_last_conversation_id:${activeWorkspaceId}`,
    );
    router.push(
      last?.startsWith("dm:")
        ? `/home/${activeWorkspaceId}/dms/${last.slice(3)}?dmOnly=1`
        : `/home/${activeWorkspaceId}?dmOnly=1`,
    );
  };
  const resolveWorkspaceRoute = (url: string) => {
    if (url === "/dashboard/saved")
      return activeWorkspaceId
        ? `/home/${activeWorkspaceId}/saved`
        : "/workspaces";
    if (url === "/dashboard/notifications")
      return activeWorkspaceId
        ? `/home/${activeWorkspaceId}/notifications`
        : "/workspaces";
    return url;
  };
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
          "h-14 shrink-0 border-sidebar-border/70 px-2 py-3",
          isWorkspaceRoute ? "bg-[var(--chat-sidebar-bg)]" : "bg-sidebar/90",
        )}
        aria-hidden="true"
      />
      <SidebarContent
        className={cn(
          "flex-none gap-0 overflow-x-hidden px-1 pb-0 pt-1",
          isWorkspaceRoute ? "bg-[var(--chat-sidebar-bg)]" : "bg-sidebar",
        )}
      >
        <SidebarGroup className="py-0">
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <OrgSwitcher />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Home"
                isActive={isHomeActive}
                className={railBtn}
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
                <span className={railIcon(isHomeActive)}><Icons.home className="size-6" /></span>
                <span className={railLabel}>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Direct messages"
                isActive={isDmActive}
                className={railBtn}
                onClick={openDirectMessages}
              >
                <span className={railIcon(isDmActive)}><Icons.chat className="size-6" /></span>
                <span className={railLabel}>DMs</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Activity"
                isActive={isActivityActive}
                aria-current={isActivityActive ? "page" : undefined}
                className={railBtn}
                onClick={() => router.push(activityPath)}
              >
                <span className={railIcon(isActivityActive)}>
                  <Icons.activity className="size-6" />
                </span>
                <span className={railLabel}>Activity</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                <PopoverTrigger render={<SidebarMenuButton tooltip="More" aria-label="More" className={railBtn} />}>
                  <span className={railIcon()}><Icons.dots className="size-6" /></span>
                  <span className={railLabel}>More</span>
                </PopoverTrigger>
                <PopoverContent side="right" align="start" className="w-64 p-1">
                  <button type="button" onClick={() => { setMoreOpen(false); window.dispatchEvent(new Event("workspace:open-files")); }} className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm"><Icons.page className="size-5" />Files</button>
                  <button type="button" onClick={() => { setMoreOpen(false); router.push(activeWorkspaceId ? `/home/${activeWorkspaceId}/saved` : "/workspaces"); }} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm ${pathname === `/home/${activeWorkspaceId}/saved` ? "bg-accent" : "hover:bg-accent"}`}><Icons.bookmark className="size-5" />Saved items</button>
                  <button type="button" onClick={() => { setMoreOpen(false); toast.info("Agents & tools are coming soon."); }} className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm"><Icons.settings className="size-5" />Agents &amp; tools</button>
                </PopoverContent>
              </Popover>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Popover>
                <PopoverTrigger render={<SidebarMenuButton tooltip="Admin" className={railBtn} />}>
                  <span className={railIcon()}><Icons.settings className="size-6" /></span>
                  <span className={railLabel}>Admin</span>
                </PopoverTrigger>
                <PopoverContent side="right" align="end" className="w-72 p-1">
                  <div className="px-3 py-2 text-sm font-semibold">Admin Tools</div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm"><span>Current plan: Free</span><button type="button" className="text-primary hover:underline" onClick={() => toast.info("Billing is coming soon.")}>Manage billing</button></div>
                  {["Workspace settings", "Edit workspace"].map((label) => <button key={label} type="button" onClick={() => toast.info(`${label} are coming soon.`)} className="hover:bg-accent flex w-full rounded-md px-3 py-2 text-left text-sm">{label}</button>)}
                  <div className="border-border my-1 border-t" />
                  <button type="button" onClick={() => activeWorkspaceId ? router.push(`/home/${activeWorkspaceId}/admin`) : toast.info("Open a workspace first.")} className="hover:bg-accent flex w-full rounded-md px-3 py-2 text-left text-sm">Manage members</button>
                  {["Apps & workflows", "Workspace analytics"].map((label) => <button key={label} type="button" onClick={() => toast.info(`${label} are coming soon.`)} className="hover:bg-accent flex w-full rounded-md px-3 py-2 text-left text-sm">{label}</button>)}
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
                const itemUrl = resolveWorkspaceRoute(item.url);
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
                          isActive={pathname === itemUrl}
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
                        {item.items?.map((subItem) => {
                          const subItemUrl = resolveWorkspaceRoute(subItem.url);
                          return (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton
                                render={
                                  <Link
                                    href={subItemUrl}
                                    aria-label={subItem.title}
                                  />
                                }
                                onClick={() => router.push(subItemUrl)}
                                isActive={pathname === subItemUrl}
                                className="hover:bg-sidebar-accent/80 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                              >
                                <span>{subItem.title}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link href={itemUrl} aria-label={item.title} />}
                      onClick={() => router.push(itemUrl)}
                      tooltip={item.title}
                      isActive={pathname === itemUrl}
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
          "min-h-0 gap-0 border-t-0 p-0 pt-2",
          isWorkspaceRoute
            ? "border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)]"
            : "border-sidebar-border/70 bg-sidebar/90",
        )}
      >
        <SidebarMenu className="gap-2">
          <SidebarMenuItem className="px-1 pt-1.5 dark:pt-2">
            <Popover open={createOpen} onOpenChange={setCreateOpen}>
                <PopoverTrigger render={<SidebarMenuButton tooltip="Create" aria-label="Create" className="mx-auto flex size-9 items-center justify-center rounded-full bg-white/20 p-0 text-white/85 shadow-none transition-colors hover:bg-white/30 hover:text-white" />}>
                <span className="relative flex size-6 items-center justify-center">
                  <Icons.add className={cn("absolute size-5 transition-all duration-200", createOpen ? "rotate-45 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
                  <IconX className={cn("absolute size-5 transition-all duration-200", createOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-45 scale-0 opacity-0")} />
                </span>
              </PopoverTrigger>
              <PopoverContent side="right" align="end" className="w-64 p-1">
                {[["Message", openDirectMessages], ["Channel", () => router.push(activeWorkspaceId ? `/home/${activeWorkspaceId}` : "/home")], ["Huddle", () => toast.info("Huddles are coming soon.")], ["Canvas", () => toast.info("Canvas is coming soon.")], ["List", () => toast.info("Lists are coming soon.")], ["Workflow", () => toast.info("Workflows are coming soon.")]].map(([label, action]) => <button key={label as string} type="button" onClick={action as () => void} className="hover:bg-accent flex w-full items-center rounded-md px-3 py-2 text-left text-sm">{label as string}</button>)}
                <div className="border-border my-1 border-t" />
                <button type="button" onClick={() => activeWorkspaceId ? router.push(`/home/${activeWorkspaceId}/admin`) : toast.info("Open a workspace first.")} className="hover:bg-accent flex w-full items-center rounded-md px-3 py-2 text-left text-sm">Invite people</button>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
          <SidebarMenuItem className="flex items-center justify-center px-1 py-1.5 dark:py-2.5">
            <ThemeModeToggle />
          </SidebarMenuItem>
          <SidebarMenuItem className="pt-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton className="mx-auto size-9 min-h-0 p-0 data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground hover:bg-sidebar-accent/80" />
                }
              >
                {user && (
                  <span className="relative">
                    <UserAvatarProfile
                      className="size-9 rounded-lg"
                      showInfo={false}
                      user={user}
                    />
                    <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[var(--chat-sidebar-bg)] bg-emerald-500" />
                  </span>
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
                    onClick={() => router.push(activeWorkspaceId ? `/home/${activeWorkspaceId}/notifications` : "/workspaces")}
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
      <WorkspaceFilesDialog />
      <SidebarRail />
    </Sidebar>
  );
}
