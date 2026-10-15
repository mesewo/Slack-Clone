"use client";
import { useEffect, useRef, useState } from "react";
import { useKBar } from "kbar";
import { useParams, useRouter } from "next/navigation";
import { Icons } from "@/components/icons";
import { Button } from "./ui/button";

export default function SearchInput({ workspaceMode = false }: { workspaceMode?: boolean }) {
  const { query } = useKBar();
  const router = useRouter();
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const [value, setValue] = useState("");
  const workspaceSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!workspaceMode || !workspaceId || value.trim().length < 2) return;
    const timeout = window.setTimeout(() => {
      router.push(`/home/${workspaceId}/search?q=${encodeURIComponent(value.trim())}`);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [router, value, workspaceId, workspaceMode]);

  useEffect(() => {
    if (!workspaceMode) return;
    const onShortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        ["k", "g"].includes(event.key.toLowerCase())
      ) {
        event.preventDefault();
        event.stopPropagation();
        workspaceSearchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onShortcut, true);
    return () => window.removeEventListener("keydown", onShortcut, true);
  }, [query, workspaceMode]);

  function submitSearch() {
    const term = value.trim();
    if (!workspaceId || term.length < 2) return;
    router.push(`/home/${workspaceId}/search?q=${encodeURIComponent(term)}`);
  }

  if (workspaceMode) {
    return (
      <div className="relative w-full">
        <Icons.search className="text-white/80 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          ref={workspaceSearchRef}
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitSearch();
            }
          }}
          placeholder="Search messages, people, settings..."
          aria-label="Search messages and people"
          className="h-9 w-full rounded-[0.5rem] border border-white/15 bg-white/20 pr-12 pl-9 text-sm text-white outline-none placeholder:text-white/80 hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/40"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/75">⌘/Ctrl K</kbd>
      </div>
    );
  }

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
