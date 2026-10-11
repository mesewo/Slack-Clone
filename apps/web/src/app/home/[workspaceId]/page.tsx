"use client";

import { IconMessageCircle } from "@tabler/icons-react";

export default function WorkspacePage() {
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background text-foreground">
      <div className="flex flex-col items-center gap-5 text-center">
        <div aria-hidden="true" className="relative flex size-36 items-center justify-center [perspective:600px]">
          <span className="absolute left-4 top-3 size-20 -rotate-12 rounded-[1.6rem] bg-gradient-to-br from-violet-200 via-fuchsia-400 to-violet-800 shadow-[0_22px_35px_rgba(76,29,149,0.4),inset_0_2px_3px_rgba(255,255,255,0.7)] ring-1 ring-white/30 motion-safe:animate-[bounce_4s_ease-in-out_infinite]" />
          <span className="absolute right-3 bottom-3 flex size-14 rotate-[12deg] items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-sky-200 via-cyan-400 to-blue-700 shadow-[0_16px_26px_rgba(30,64,175,0.35),inset_0_2px_3px_rgba(255,255,255,0.75)] ring-1 ring-white/40 motion-safe:animate-[bounce_4.5s_ease-in-out_infinite]">
            <IconMessageCircle className="size-7 text-white drop-shadow" strokeWidth={2.5} />
          </span>
          <span className="relative -translate-x-2 -translate-y-1 flex size-[4.5rem] -rotate-6 items-center justify-center rounded-[1.5rem] border border-white/60 bg-gradient-to-br from-fuchsia-300 via-purple-500 to-indigo-800 text-white shadow-[0_24px_38px_rgba(88,28,135,0.45),inset_0_3px_5px_rgba(255,255,255,0.55)] ring-1 ring-black/10 motion-safe:animate-[bounce_3.5s_ease-in-out_infinite]">
            <IconMessageCircle className="size-9 drop-shadow-sm" strokeWidth={2.2} />
          </span>
        </div>
        <div>
          <h1 className="text-xl font-semibold">Open to chat</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Choose a channel or direct message from the sidebar.
          </p>
        </div>
      </div>
    </div>
  );
}
