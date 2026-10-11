import AppShell from "@/components/layout/app-shell";

export default function ActivityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
