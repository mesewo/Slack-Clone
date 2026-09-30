function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-foreground/10 ${className}`} />;
}

export default function WorkspaceLoading() {
  return (
    <div className="bg-background fixed inset-0 z-[100] flex overflow-hidden">
      <aside
        aria-hidden="true"
        className="flex w-[70px] shrink-0 flex-col items-center gap-6 border-r border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)] px-2 py-4 opacity-[0.66]"
      >
        <SkeletonBlock className="size-9 rounded-lg" />
        <div className="flex flex-col gap-5">
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonBlock key={index} className="size-8 rounded-lg" />
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-4">
          <SkeletonBlock className="size-8 rounded-full" />
          <SkeletonBlock className="size-8 rounded-full" />
        </div>
      </aside>

      <aside className="flex w-[300px] shrink-0 flex-col gap-5 border-r border-[var(--chat-sidebar-border)] bg-[var(--chat-sidebar-bg)] p-4">
        <SkeletonBlock className="h-7 w-40" />
        <SkeletonBlock className="h-9 w-full rounded-lg" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, index) => (
            <SkeletonBlock key={index} className="h-7 w-full" />
          ))}
        </div>
        <SkeletonBlock className="mt-2 h-5 w-28" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 7 }, (_, index) => (
            <SkeletonBlock key={index} className="h-7 w-full" />
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-6 bg-background p-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex flex-col gap-2">
            <SkeletonBlock className="h-6 w-48" />
            <SkeletonBlock className="h-3 w-72" />
          </div>
          <SkeletonBlock className="size-8" />
        </div>
        <div className="flex flex-1 flex-col justify-end gap-6 pb-4">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex max-w-2xl items-start gap-3">
              <SkeletonBlock className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <SkeletonBlock className="h-4 w-36" />
                <SkeletonBlock className={`h-4 ${index % 2 ? "w-4/5" : "w-full"}`} />
              </div>
            </div>
          ))}
        </div>
        <SkeletonBlock className="h-28 w-full rounded-xl" />
      </main>
    </div>
  );
}
