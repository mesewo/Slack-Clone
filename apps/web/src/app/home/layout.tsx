import AppShell from "@/components/layout/app-shell";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
