"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconDeviceMobileMessage } from "@tabler/icons-react";

const DESIGN_WIDTH = 1280;
const MIN_SCALE = 0.75;

export function ResponsiveGuard({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    const updateLayout = () => {
      const mobile =
        window.matchMedia("(pointer: coarse)").matches ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      if (mobile) {
        setIsMobile(true);
        document.body.style.zoom = "1";
        return;
      }

      const scale = Math.min(1, window.innerWidth / DESIGN_WIDTH);
      if (scale < MIN_SCALE) {
        setIsMobile(true);
        document.body.style.zoom = "1";
        return;
      }

      setIsMobile(false);
      document.body.style.zoom = String(scale);
    };

    updateLayout();
    setMounted(true);

    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateLayout, 100);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
      document.body.style.zoom = "1";
    };
  }, []);

  if (!mounted) return null;

  if (isMobile) {
    return (
      <main className="bg-background text-foreground fixed inset-0 z-[9999] flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
        <IconDeviceMobileMessage className="text-primary size-14" aria-hidden="true" />
        <h1 className="max-w-sm text-xl font-semibold">
          The Slack Clone mobile app is coming soon.
        </h1>
        <a className="text-primary text-sm underline underline-offset-4" href="https://github.com/mesewo/slack-clone">
          View the repository
        </a>
      </main>
    );
  }

  return <>{children}</>;
}
