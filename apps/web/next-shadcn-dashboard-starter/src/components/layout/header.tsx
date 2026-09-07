import React from "react";
import { SidebarTrigger } from "../ui/sidebar";
import { Separator } from "../ui/separator";
import { Breadcrumbs } from "../breadcrumbs";
import SearchInput from "../search-input";
import { ThemeSelector } from "../themes/theme-selector";
import { ThemeModeToggle } from "../themes/theme-mode-toggle";
import CtaGithub from "./cta-github";
import { NotificationCenter } from "@/features/notifications/components/notification-center";

export default function Header() {
  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 border-b px-3 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-xl md:h-14 md:px-4">
      <div className="flex items-center gap-2 pr-2">
        <SidebarTrigger className="-ml-1 rounded-full hover:bg-accent/70" />
        <Separator
          orientation="vertical"
          className="mr-1 h-4 data-vertical:self-center"
        />
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-2 pl-2 md:gap-3">
        <CtaGithub />
        <div className="hidden md:flex">
          <SearchInput />
        </div>
        <ThemeModeToggle />
        <div className="hidden sm:block">
          <ThemeSelector />
        </div>
        <NotificationCenter />
      </div>
    </header>
  );
}
