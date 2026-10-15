function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-current/10 ${className}`} />;
}

export function WorkspaceLoading() {
  return (
    <div aria-label="Loading workspace" role="status" className="fixed inset-0 z-[100] flex overflow-hidden bg-white text-black dark:bg-black dark:text-white">
      <aside aria-hidden="true" className="flex w-[4.5rem] shrink-0 flex-col items-center border-r border-white/10 bg-[#4a154b] px-2 dark:bg-[#111012]">
        <div className="h-14 w-full border-b border-white/10" />
        <div className="flex flex-col gap-5 pt-4">
          {Array.from({ length: 5 }, (_, index) => <SkeletonBlock key={index} className="size-9 rounded-lg bg-white/20" />)}
        </div>
        <div className="mt-auto flex flex-col gap-5 pb-5">
          <SkeletonBlock className="size-9 rounded-full bg-white/20" />
          <SkeletonBlock className="size-9 rounded-lg bg-white/20" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header aria-hidden="true" className="h-14 shrink-0 border-b border-white/10 bg-[#4a154b] dark:bg-[#111012]" />
        <div className="flex min-h-0 flex-1">
          <aside aria-hidden="true" className="flex w-[min(24vw,300px)] min-w-[240px] shrink-0 flex-col gap-5 border-r border-white/10 bg-[#4a154b] p-4 text-white dark:bg-[#111012]">
            <SkeletonBlock className="h-7 w-40 bg-white/20" />
            <SkeletonBlock className="h-9 w-full rounded-lg bg-white/15" />
            <div className="flex flex-col gap-3 pt-1">
              {Array.from({ length: 9 }, (_, index) => <SkeletonBlock key={index} className={`h-7 bg-white/15 ${index % 3 === 0 ? "w-4/5" : "w-full"}`} />)}
            </div>
          </aside>
          <main aria-hidden="true" className="flex min-w-0 flex-1 flex-col bg-white p-5 text-black dark:bg-black dark:text-white sm:p-6">
            <div className="flex h-12 items-center justify-between border-b border-black/10 pb-3 dark:border-white/10">
              <div className="flex flex-col gap-2"><SkeletonBlock className="h-5 w-44" /><SkeletonBlock className="h-3 w-64" /></div>
              <SkeletonBlock className="size-8" />
            </div>
            <div className="flex flex-1 flex-col justify-end gap-6 py-5">
              {Array.from({ length: 5 }, (_, index) => <div key={index} className="flex max-w-2xl items-start gap-3"><SkeletonBlock className="size-9 shrink-0 rounded-full" /><div className="flex flex-1 flex-col gap-2"><SkeletonBlock className="h-4 w-36" /><SkeletonBlock className={`h-4 ${index % 2 ? "w-4/5" : "w-full"}`} /></div></div>)}
            </div>
            <SkeletonBlock className="h-24 w-full rounded-xl" />
          </main>
        </div>
      </div>
      <span className="sr-only">Loading workspace…</span>
    </div>
  );
}
