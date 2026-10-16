export default function Loading() {
  return (
    <main role="status" aria-label="Loading conversation" className="flex min-h-0 flex-1 flex-col bg-background p-5 sm:p-6">
      <div className="flex h-12 items-center justify-between border-b border-border pb-3">
        <div className="space-y-2"><div className="h-5 w-40 animate-pulse rounded bg-muted" /><div className="h-3 w-56 animate-pulse rounded bg-muted/70" /></div>
        <div className="size-8 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-6 py-5">
        {[0, 1, 2, 3].map((item) => <div key={item} className="flex max-w-2xl items-start gap-3"><div className="size-9 shrink-0 animate-pulse rounded-md bg-muted" /><div className="flex flex-1 flex-col gap-2"><div className="h-3 w-32 animate-pulse rounded bg-muted" /><div className={`h-4 animate-pulse rounded bg-muted/70 ${item % 2 ? "w-4/5" : "w-full"}`} /></div></div>)}
      </div>
      <div className="h-24 animate-pulse rounded-xl border border-border bg-muted/40" />
    </main>
  );
}
