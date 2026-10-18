import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "welcome back | Slack-clone Home",
  description: "Choose a workspace to continue.",
};

export default function WorkspaceHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
