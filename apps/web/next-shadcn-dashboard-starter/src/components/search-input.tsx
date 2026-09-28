"use client";
import { useKBar } from "kbar";
import { Icons } from "@/components/icons";
import { Button } from "./ui/button";

export default function SearchInput({ workspaceMode = false }: { workspaceMode?: boolean }) {
  const { query } = useKBar();
  return (
    <div className="w-full space-y-2">
      <Button
        variant={workspaceMode ? "ghost" : "outline"}
        className={`relative h-9 w-full justify-start rounded-[0.5rem] text-sm font-normal shadow-none ${workspaceMode ? "border border-white/15 bg-white/20 text-white hover:bg-white/25 hover:text-white" : "bg-background/95 text-muted-foreground"}`}
        onClick={query.toggle}
      >
        <Icons.search className="mr-2 h-4 w-4" />
        Search messages, people, settings...
      </Button>
    </div>
  );
}
