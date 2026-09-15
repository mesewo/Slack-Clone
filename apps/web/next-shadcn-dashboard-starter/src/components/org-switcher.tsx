"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";
import {
  workspaceService,
  type Workspace,
} from "@/features/workspace/services/workspaceService";
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const activeWorkspaceKey = "active_workspace_id";

export function OrgSwitcher() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    void workspaceService
      .list()
      .then((items) => {
        setWorkspaces(items);
        const saved = window.localStorage.getItem(activeWorkspaceKey);
        setActiveId(
          items.some((item) => item.id === saved) ? saved! : items[0]?.id || "",
        );
      })
      .catch(() => setWorkspaces([]));
  }, []);

  const active =
    workspaces.find((workspace) => workspace.id === activeId) || workspaces[0];
  const selectWorkspace = (workspace: Workspace) => {
    setActiveId(workspace.id);
    window.localStorage.setItem(activeWorkspaceKey, workspace.id);
    router.push(`/home/${workspace.id}`);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton tooltip="Workspace" />}
          >
            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
              <Icons.galleryVerticalEnd className="size-4" />
            </div>
            <span className="sr-only">
              {active?.name || "Select workspace"}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            </DropdownMenuGroup>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                onClick={() => selectWorkspace(workspace)}
              >
                <Icons.galleryVerticalEnd className="mr-2 size-4" />
                <span className="truncate">{workspace.name}</span>
                {workspace.id === activeId && (
                  <Icons.check className="ml-auto size-4" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/home")}>
              <Icons.add className="mr-2 size-4" /> Create workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
