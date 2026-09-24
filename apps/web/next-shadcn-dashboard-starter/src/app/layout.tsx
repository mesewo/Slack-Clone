import Providers from "@/components/layout/providers";
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

const META_THEME_COLORS = {
  light: "#ffffff",
  dark: "#09090b",
};

export const metadata: Metadata = {
  ...(process.env.NEXT_PUBLIC_APP_URL
    ? { metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL) }
    : {}),
  title: {
    default: "Slack Clone - Next.js Admin Dashboard Template",
    template: "%s | Slack Clone",
  },
  description:
    "This is a slack clone that I personally worked on to make it appear and function as close as possible.",
  openGraph: {
    title: "Slack Clone - Next.js Admin Dashboard Template",
    description:
      "This is a slack clone that I personally worked on to make it appear and function as close as possible.",
    siteName: "Slack Clone",
    type: "website",
    images: [
      {
        url: "/shadcn-dashboard.png",
        width: 3200,
        height: 1600,
        alt: "Slack Clone overview page",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Slack Clone - Next.js Admin Dashboard Template",
    description:
      "This is a slack clone that I personally worked on to make it appear and function as close as possible.",
    images: ["/shadcn-dashboard.png"],
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
              {children}
            </Providers>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
