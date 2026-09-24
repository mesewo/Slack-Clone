import { cn } from "@/lib/utils";

// Keep the theme's font variable contract without next/font/google's
// Turbopack-only resolver, which is unavailable in this workspace install.
export const fontVariables = cn(
  "[--font-sans:'Lato',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif]",
  "[--font-mono:'Courier New',monospace]",
  "[--font-source-code-pro:'Courier New',monospace]",
  "[--font-instrument:Arial,sans-serif]",
  "[--font-noto-mono:'Courier New',monospace]",
  "[--font-mullish:Arial,sans-serif]",
  "[--font-inter:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif]",
  "[--font-architects-daughter:cursive]",
  "[--font-dm-sans:Arial,sans-serif]",
  "[--font-fira-code:'Courier New',monospace]",
  "[--font-outfit:Arial,sans-serif]",
  "[--font-space-mono:'Courier New',monospace]",
  "[--font-jetbrains-mono:'Courier New',monospace]",
  "[--font-merriweather:Georgia,serif]",
  "[--font-playfair-display:Georgia,serif]",
);
