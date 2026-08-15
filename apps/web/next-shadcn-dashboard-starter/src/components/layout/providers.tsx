"use client";
import React, { useEffect } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { ActiveThemeProvider } from "../themes/active-theme";
import QueryProvider from "./query-provider";

export default function Providers({
  activeThemeValue,
  children,
}: {
  activeThemeValue: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    try {
      const meta = document.querySelector(
        'meta[name="theme-color"]',
      ) as HTMLMetaElement | null;
      if (meta) {
        const color = activeThemeValue === "dark" ? "#09090b" : "#ffffff";
        meta.setAttribute("content", color);
      }
    } catch (_) {
      // ignore
    }
  }, [activeThemeValue]);

  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const wrappedChildren = (
    <ActiveThemeProvider initialTheme={activeThemeValue}>
      <QueryProvider>{children}</QueryProvider>
    </ActiveThemeProvider>
  );

  if (!clerkPublishableKey) {
    return wrappedChildren;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      {wrappedChildren}
    </ClerkProvider>
  );
}
