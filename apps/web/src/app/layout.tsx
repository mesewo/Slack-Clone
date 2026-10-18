import Providers from "@/components/layout/providers";
import { ResponsiveGuard } from "@/components/responsive-guard";
import { Toaster } from "@/components/ui/sonner";
import { fontVariables } from "@/components/themes/font.config";
import { DEFAULT_THEME, THEMES } from "@/components/themes/theme.config";
import ThemeProvider from "@/components/themes/theme-provider";
import { cn } from "@/lib/utils";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import NextTopLoader from "nextjs-toploader";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "../styles/globals.css";

/* eslint-disable @next/next/no-page-custom-font -- App Router root layout loads this font globally. */

const META_THEME_COLORS = {
  light: "#ffffff",
  dark: "#09090b",
};

export const metadata: Metadata = {
  ...(process.env.NEXT_PUBLIC_APP_URL
    ? { metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL) }
    : {}),
  title: {
    default: "slack-clone",
    template: "%s",
  },
  icons: {
    icon: "/slack-logo.png",
    shortcut: "/slack-logo.png",
    apple: "/slack-logo.png",
  },
  description: "A self-hosted team messaging app built with Next.js and Go.",
  openGraph: {
    title: "slack-clone",
    description: "A self-hosted team messaging app built with Next.js and Go.",
    siteName: "slack-clone",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "slack-clone",
    description: "A self-hosted team messaging app built with Next.js and Go.",
  },
};

export const viewport: Viewport = {
  themeColor: META_THEME_COLORS.light,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const activeThemeValue = cookieStore.get("active_theme")?.value;
  const isValidTheme = THEMES.some((t) => t.value === activeThemeValue);
  const themeToApply = isValidTheme ? activeThemeValue! : DEFAULT_THEME;

  return (
    <html lang="en" suppressHydrationWarning data-theme={themeToApply}>
      <head>
        <link rel="icon" href="/slack-logo.png" type="image/png" />
        <link rel="shortcut icon" href="/slack-logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/slack-logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Lato:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={cn(
          "bg-background overflow-x-hidden overscroll-none font-sans antialiased",
          fontVariables,
        )}
      >
        <NextTopLoader color="var(--primary)" showSpinner={false} />
        <NuqsAdapter>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            enableColorScheme
          >
            <Providers activeThemeValue={themeToApply}>
              <Toaster />
              <ResponsiveGuard>{children}</ResponsiveGuard>
            </Providers>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
