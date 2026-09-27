"use client";

export default function WorkspacePage() {
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black text-white">
      <div className="relative flex flex-col items-center gap-5 text-center">
        <div className="absolute inset-0 -z-0 animate-pulse rounded-full bg-purple-700/20 blur-3xl" />
        <div className="z-10 flex size-20 items-center justify-center rounded-3xl border border-purple-400/30 bg-purple-950/70 shadow-[0_0_60px_rgba(97,31,105,0.45)]">
          <span className="size-3 animate-ping rounded-full bg-purple-300" />
        </div>
        <div className="z-10">
          <h1 className="text-xl font-semibold">Open to chat</h1>
          <p className="mt-1 text-sm text-white/60">
            Choose a channel or direct message from the sidebar.
          </p>
        </div>
      </div>
    </div>
  );
}
