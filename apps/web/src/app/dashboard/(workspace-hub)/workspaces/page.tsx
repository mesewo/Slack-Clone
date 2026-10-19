"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { channelService } from "@/features/workspace/services/channelService";
import {
  workspaceService,
  type Workspace,
} from "@/features/workspace/services/workspaceService";

type WorkspaceWithMemberCount = Workspace & {
  memberCount: number | null;
  activeCount: number | null;
};

const footerGroups = [
  {
    title: "Product",
    links: [
      ["Watch Demo", "https://slack.com/demo"],
      ["Pricing", "https://slack.com/pricing"],
      ["Paid vs. Free", "https://slack.com/pricing/paid-vs-free"],
      ["Accessibility", "https://slack.com/accessibility"],
      ["Featured Releases", "https://slack.com/innovations"],
      ["Changelog", "https://slack.com/changelog"],
      [
        "Status",
        "https://slack-status.com/?_gl=1*6cfpp0*_gcl_au*MTg5ODY1ODY3LjE3MDE3MTQ3MTc.",
      ],
    ],
  },
  {
    title: "Why Slack?",
    links: [
      ["Slack vs. Email", "https://slack.com/compare/slack-vs-email"],
      ["Slack vs. Teams", "https://slack.com/compare/slack-vs-teams"],
      ["Enterprise", "https://slack.com/enterprise"],
      ["Small Business", "https://slack.com/solutions/small-business"],
      ["Productivity", "https://slack.com/engage-users"],
      ["Task Management", "https://slack.com/solutions/task-management"],
      ["Scale", "https://slack.com/scale"],
      ["Trust", "https://slack.com/trust"],
    ],
  },
  {
    title: "Features",
    links: [
      ["Channels", "https://slack.com/features/channels"],
      ["Slack Connect", "https://slack.com/connect"],
      ["Workflow Builder", "https://slack.com/features/workflow-automation"],
      ["Messaging", "https://slack.com/features/team-chat"],
      ["Huddles", "https://slack.com/features/huddles"],
      ["Canvas", "https://slack.com/features/canvas"],
      ["Lists", "https://slack.com/features/task-list"],
      ["Clips", "https://slack.com/features/clips"],
      ["Apps & Integrations", "https://slack.com/integrations"],
      ["Slack AI", "https://slack.com/features/ai"],
      ["Agentforce", "https://slack.com/ai-agents"],
      ["Enterprise Search", "https://slack.com/features/enterprise-search"],
      ["Security", "https://slack.com/trust/security"],
      [
        "Enterprise Key Management",
        "https://slack.com/enterprise-key-management",
      ],
      ["Slack Atlas", "https://slack.com/features/atlas"],
      ["See all features", "https://slack.com/features"],
    ],
  },
  {
    title: "Solutions",
    links: [
      ["Engineering", "https://slack.com/solutions/engineering"],
      ["IT", "https://slack.com/solutions/information-technology"],
      ["Customer Service", "https://slack.com/solutions/customer-service"],
      ["Sales", "https://slack.com/solutions/sales"],
      ["Project Management", "https://slack.com/solutions/project-management"],
      ["Marketing", "https://slack.com/solutions/marketing"],
      ["Security", "https://slack.com/solutions/security"],
      [
        "Manufacturing, Auto & Energy",
        "https://slack.com/solutions/manufacturing",
      ],
      ["Technology", "https://slack.com/solutions/technology"],
      ["Media", "https://slack.com/solutions/media"],
      ["Financial Services", "https://slack.com/solutions/financial-services"],
      ["Retail", "https://slack.com/solutions/retail"],
      ["Public Sector", "https://slack.com/solutions/public-sector"],
      ["Education", "https://slack.com/solutions/distance-learning"],
      ["Health & Life Sciences", "https://slack.com/solutions/healthcare"],
      ["See all solutions", "https://slack.com/solutions"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Help Center", "https://slack.com/help"],
      ["What's New", "https://slack.com/innovations"],
      ["Resources Library", "https://slack.com/resources"],
      ["Slack Blog", "https://slack.com/blog"],
      ["Community", "https://slack.com/community"],
      ["Customer Stories", "https://slack.com/customer-stories"],
      ["Events", "https://slack.com/events"],
      [
        "Developers",
        "https://api.slack.com/?_gl=1*618lju*_gcl_au*MTg5ODY1ODY3LjE3MDE3MTQ3MTc.",
      ],
      ["Partner Program", "https://slack.com/partners"],
      ["Partner Offers", "https://slack.com/partner-offers"],
      ["Slack Marketplace", "https://slack.com/marketplace"],
      ["Slack Certified", "https://slackcertified.com/"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About Us", "https://slack.com/about"],
      ["News", "https://slack.com/blog/news"],
      ["Media Kit", "https://slack.com/media-kit"],
      ["Brand Center", "https://brand.slackhq.com/"],
      ["Careers", "https://slack.com/careers"],
      ["Swag Store", "https://www.salesforcestore.com/Slack-C124.aspx"],
      ["Engineering Blog", "https://slack.engineering/"],
      ["Design Blog", "https://slack.design/"],
      ["Contact Us", "https://slack.com/help"],
    ],
  },
] as const;

function SlackMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg
      aria-label="Slack"
      role="img"
      viewBox="0 0 60 60"
      className={className}
    >
      <path
        fill="#36C5F0"
        d="M17.4 2.8a5.4 5.4 0 0 1 5.4 5.4v10.7H12a5.4 5.4 0 1 1 0-10.7h.1a5.4 5.4 0 0 1 5.3-5.4ZM2.8 23.4a5.4 5.4 0 0 1 5.4-5.4h10.7v10.8H8.2a5.4 5.4 0 0 1-5.4-5.4Z"
      />
      <path
        fill="#2EB67D"
        d="M57.2 17.4a5.4 5.4 0 0 1-5.4 5.4H41.1V12h10.7a5.4 5.4 0 0 1 5.4 5.4Zm-20.6-14a5.4 5.4 0 0 1 5.4 5.4v10.7H31.2V8.8a5.4 5.4 0 0 1 5.4-5.4Z"
      />
      <path
        fill="#E01E5A"
        d="M42.6 57.2a5.4 5.4 0 0 1-5.4-5.4V41.1h10.8v10.7a5.4 5.4 0 0 1-5.4 5.4Zm14-20.6a5.4 5.4 0 0 1-5.4 5.4H40.5V31.2h10.7a5.4 5.4 0 0 1 5.4 5.4Z"
      />
      <path
        fill="#ECB22E"
        d="M2.8 42.6a5.4 5.4 0 0 1 5.4-5.4h10.7V48H8.2a5.4 5.4 0 0 1-5.4-5.4Zm20.6 14a5.4 5.4 0 0 1-5.4-5.4V40.5h10.8v10.7a5.4 5.4 0 0 1-5.4 5.4Z"
      />
    </svg>
  );
}

function WorkspaceGlyph({ index }: { index: number }) {
  const palettes = ["#36C5F0", "#2EB67D", "#E01E5A", "#ECB22E", "#6B5CE7"];
  const color = palettes[index % palettes.length];
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3f5]">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7">
        <path
          fill={color}
          d="M10 2a4 4 0 0 1 4 4v8H6a4 4 0 1 1 0-8 4 4 0 0 1 4-4ZM2 18a4 4 0 0 1 4-4h8v8H6a4 4 0 0 1-4-4Z"
        />
        <path
          fill="#2EB67D"
          d="M30 10a4 4 0 0 1-4 4h-8V6h8a4 4 0 0 1 4 4Zm-12-8a4 4 0 0 1 4 4v8h-8V6a4 4 0 0 1 4-4Z"
        />
        <path
          fill="#E01E5A"
          d="M22 30a4 4 0 0 1-4-4v-8h8v8a4 4 0 0 1-4 4Zm8-12a4 4 0 0 1-4 4h-8v-8h8a4 4 0 0 1 4 4Z"
        />
        <path
          fill="#ECB22E"
          d="M2 22a4 4 0 0 1 4-4h8v8H6a4 4 0 0 1-4-4Zm12 8a4 4 0 0 1-4-4v-8h8v8a4 4 0 0 1-4 4Z"
        />
      </svg>
    </span>
  );
}

function FourSquare() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
      <path
        d="M2 2h8v8H2zm12 0h8v8h-8zM2 14h8v8H2zm12 0h8v8h-8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export default function WorkspacesPage() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMemberCount[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openingWorkspaceId, setOpeningWorkspaceId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const firstName =
    user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  useEffect(() => {
    document.title = "welcome back | Slack-clone Home";
    const onScroll = () => setScrolled(window.scrollY > 32);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const items = await workspaceService.list();
      const enriched = await Promise.all(
        items.map(async (workspace) => {
          try {
            const result = await workspaceService.listMembers(workspace.id);
            return {
              ...workspace,
              memberCount: result.members.length,
              activeCount: result.members.filter(
                (member) =>
                  member.presence_status?.toLowerCase() === "online" ||
                  member.presence_status?.toLowerCase() === "active",
              ).length,
            };
          } catch {
            return { ...workspace, memberCount: null, activeCount: null };
          }
        }),
      );
      setWorkspaces(enriched);
    } catch {
      setError("Workspaces could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      await workspaceService.create({ name: name.trim() });
      toast.success("Workspace created");
      setName("");
      setDialog(null);
      await load();
    } catch {
      setError("Workspace could not be created.");
    } finally {
      setCreating(false);
    }
  };

  const joinWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!slug.trim()) return;
    setJoining(true);
    setError("");
    try {
      await workspaceService.join(slug.trim());
      toast.success("Joined workspace");
      setSlug("");
      setDialog(null);
      await load();
    } catch {
      setError("Workspace not found or could not be joined.");
    } finally {
      setJoining(false);
    }
  };

  const openWorkspace = async (workspaceId: string) => {
    setOpeningWorkspaceId(workspaceId);
    setError("");
    const newTab = window.open("about:blank", "_blank");
    try {
      const channels = await channelService.list(workspaceId);
      window.localStorage.setItem("active_workspace_id", workspaceId);
      const lastVisited = window.localStorage.getItem(
        `slack_last_conversation_id:${workspaceId}`,
      );
      const destination = lastVisited
        ? lastVisited.startsWith("dm:")
          ? `/home/${workspaceId}/dms/${lastVisited.slice(3)}`
          : `/home/${workspaceId}/channels/${lastVisited}`
        : channels[0]
          ? `/home/${workspaceId}/channels/${channels[0].id}`
          : `/home/${workspaceId}`;
      if (newTab) {
        newTab.opener = null;
        newTab.location.href = destination;
      } else setError("The workspace could not be opened in a new tab.");
    } catch {
      newTab?.close();
      setError("Workspace channels could not be loaded.");
    } finally {
      setOpeningWorkspaceId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf9f7] text-[#1d1c1d]">
      <header
        className={`sticky top-0 z-40 overflow-hidden transition-colors duration-300 ${scrolled ? "border-b border-black/10 bg-white text-[#1d1c1d] shadow-sm" : "bg-[#4a154b] text-white"}`}
      >
        {!scrolled && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 right-[12%] size-72 rounded-full border-[38px] border-white/[0.035]"
          />
        )}
        <div className="relative mx-auto flex min-h-[76px] w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
          <div className="flex min-w-0 items-center gap-3">
            <SlackMark className="size-9 shrink-0" />
            <span className="hidden h-7 w-px bg-current/25 sm:block" />
            <div className="min-w-0 truncate text-sm font-semibold sm:text-base">
              {/* <span className="hidden text-current/75 md:inline">Welcome back, {firstName}</span> */}
              <span className="hidden px-2 text-current/45 md:inline">|</span>
              <span>slack-clone</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              className={`h-10 rounded-full px-3 font-medium sm:px-4 ${scrolled ? "text-[#1d1c1d] hover:bg-[#f5f3f5]" : "text-white hover:bg-white/10"}`}
              onClick={() => {
                setError("");
                setDialog("join");
              }}
            >
              <Icons.externalLink className="mr-2 size-4" /> Join workspace
            </Button>
            <Button
              className={`h-10 rounded-full px-3 font-semibold sm:px-4 ${scrolled ? "bg-[#e9d8f2] text-[#1d1c1d] hover:bg-[#ddc7e9]" : "bg-white text-[#4a154b] hover:bg-white/90"}`}
              onClick={() => {
                setError("");
                setDialog("create");
              }}
            >
              <Icons.add className="mr-2 size-4" /> Create workspace
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-7xl px-5 pb-16 pt-12 sm:px-8 lg:px-12 lg:pt-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 left-1/2 z-0 h-[690px] w-[150vw] -translate-x-1/2 rounded-b-[50%] bg-[#4a154b]"
        />
        <div className="relative z-10">
          <div className="mb-10 text-center text-white">
            <h1 className="flex items-center justify-center gap-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Welcome back 👋
            </h1>
            <p className="mt-2 text-base text-white/80">
              Choose a workspace to get started.
            </p>
          </div>

          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_310px]">
            <section aria-labelledby="my-workspaces-heading">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <h2
                  id="my-workspaces-heading"
                  className="flex items-center gap-3 text-2xl font-bold tracking-tight text-white sm:text-3xl"
                >
                  <FourSquare />
                  My{" "}
                  <span className="text-white underline decoration-white decoration-[3px] underline-offset-[8px]">
                    workspaces
                  </span>
                </h2>
                <span className="text-sm text-white/70">
                  {workspaces.length} workspace
                  {workspaces.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-[#e6e1e5] bg-white shadow-[0_8px_28px_rgba(29,28,29,0.045)]">
                <div className="flex items-center gap-2 border-b border-[#eee9ed] bg-[#fcfafc] px-5 py-3 text-sm font-semibold text-[#4a154b] sm:px-7">
                  <span>Ready to Launch</span>
                </div>
                {loading ? (
                  <div
                    className="space-y-3 p-5"
                    role="status"
                    aria-label="Loading workspaces"
                  >
                    {[1, 2, 3].map((item) => (
                      <div
                        key={item}
                        className="h-[76px] animate-pulse rounded-xl bg-[#f4f1f4]"
                      />
                    ))}
                  </div>
                ) : workspaces.length ? (
                  workspaces.map((workspace, index) => (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => void openWorkspace(workspace.id)}
                      disabled={openingWorkspaceId === workspace.id}
                      className="group flex min-h-[86px] w-full items-center gap-4 border-b border-[#eee9ed] px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-[#faf8fb] disabled:cursor-wait disabled:opacity-60 sm:px-7"
                    >
                      <WorkspaceGlyph index={index} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-[#1d1c1d] transition-colors group-hover:text-[#1264a3]">
                          {workspace.name}
                        </span>
                        <span className="mt-1 block text-xs text-[#777277]">
                          {workspace.memberCount === null
                            ? "Member count unavailable"
                            : `${workspace.memberCount} member${workspace.memberCount === 1 ? "" : "s"}`}
                          <span className="px-1.5 text-[#c3bec3]">·</span>
                          {workspace.activeCount === null
                            ? "Active count unavailable"
                            : `${workspace.activeCount} active`}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[#1264a3]">
                        <span className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                          Launch
                        </span>
                        <Icons.arrowRight className="size-4 text-[#777277] transition-all duration-150 group-hover:text-[#1264a3] group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-6 py-12 text-center">
                    <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#f4ede8] text-[#611f69]">
                      <SlackMark className="size-8" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold">
                      Your team's next conversation starts here
                    </h3>
                    <p className="mt-2 text-sm text-[#777277]">
                      Create a workspace or join one to get started.
                    </p>
                    <div className="mt-5 flex justify-center gap-3">
                      <Button
                        onClick={() => setDialog("create")}
                        className="rounded-lg bg-[#611f69] text-white hover:bg-[#4a154b]"
                      >
                        Create workspace
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setDialog("join")}
                        className="rounded-lg"
                      >
                        Join workspace
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              {error && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {error}
                </p>
              )}
            </section>

            <aside className="space-y-4 lg:pt-1">
              <a
                href="https://slack.com/intl/en-gb/solutions/google-workspace"
                target="_blank"
                rel="noreferrer"
                className="group block overflow-hidden rounded-2xl bg-[#f6efe2] p-6 transition-transform hover:-translate-y-0.5"
              >
                <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-white text-[#4a154b]">
                  <Icons.externalLink className="size-5" />
                </span>
                <h3 className="text-base font-bold leading-6">
                  Bring your Google Workspace to Slack.
                </h3>
                <p className="mt-1 text-sm text-[#625b60]">
                  Connect Google Drive and more.
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#1264a3]">
                  Learn more{" "}
                  <Icons.arrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </a>
              <a
                href="https://slack.com/pricing"
                target="_blank"
                rel="noreferrer"
                className="group block overflow-hidden rounded-2xl bg-[#e9e2f2] p-6 transition-transform hover:-translate-y-0.5"
              >
                <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-white text-[#611f69]">
                  <Icons.sparkles className="size-5" />
                </span>
                <h3 className="text-base font-bold leading-6">
                  Get 50% off Pro.
                </h3>
                <p className="mt-1 text-sm text-[#625b60]">
                  6 days left on this offer.
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#1264a3]">
                  Explore plans{" "}
                  <Icons.arrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </a>
            </aside>
          </div>

          <section aria-labelledby="discover-heading" className="mt-16">
            <h2
              id="discover-heading"
              className="mb-5 text-2xl font-bold tracking-tight"
            >
              Discover more
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  title: "Download Slack for Windows.",
                  description: "Stay up to date on notifications.",
                  link: "Download app",
                  href: "https://slack.com/downloads",
                  icon: Icons.laptop,
                },
                {
                  title: "Connect your apps.",
                  description:
                    "Choose from over 2,600 apps, or build your own.",
                  link: "Browse apps",
                  href: "https://slack.com/marketplace",
                  icon: Icons.settings,
                },
                {
                  title: "Quick start guide to Slack.",
                  description: "Learn the basics of using Slack.",
                  link: "Get started",
                  href: "https://slack.com/help/articles/360059928654-How-to-use-Slack--your-quick-start-guide",
                  icon: Icons.help,
                },
              ].map((item) => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-[#e6e1e5] bg-white p-6 shadow-[0_6px_20px_rgba(29,28,29,0.035)]"
                >
                  <span className="mb-5 flex size-10 items-center justify-center rounded-xl bg-[#f4ede8] text-[#611f69]">
                    <item.icon className="size-5" />
                  </span>
                  <h3 className="font-bold">{item.title}</h3>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-[#625b60]">
                    {item.description}
                  </p>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#1264a3] hover:underline"
                  >
                    {item.link}
                    <Icons.arrowRight className="size-4" />
                  </a>
                </article>
              ))}
            </div>
          </section>

          <Dialog
            open={dialog === "create"}
            onOpenChange={(open) => !open && setDialog(null)}
          >
            <DialogContent className="rounded-2xl border-0 p-0 sm:max-w-md">
              <form onSubmit={createWorkspace} className="p-6 sm:p-7">
                <DialogHeader className="mb-6">
                  <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-[#f4ede8]">
                    <Icons.add className="size-6 text-[#611f69]" />
                  </span>
                  <DialogTitle className="text-xl font-bold">
                    Create a workspace
                  </DialogTitle>
                  <DialogDescription>
                    Work together with your team in one place.
                  </DialogDescription>
                </DialogHeader>
                <label
                  htmlFor="workspace-name"
                  className="mb-2 block text-sm font-semibold"
                >
                  Workspace name
                </label>
                <Input
                  id="workspace-name"
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Acme team"
                  className="h-11 rounded-lg"
                />
                {error && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <DialogFooter className="mt-6 border-0 bg-transparent p-0 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialog(null)}
                    className="rounded-lg"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creating || !name.trim()}
                    className="rounded-lg bg-[#611f69] text-white hover:bg-[#4a154b]"
                  >
                    {creating ? "Creating..." : "Create workspace"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={dialog === "join"}
            onOpenChange={(open) => !open && setDialog(null)}
          >
            <DialogContent className="rounded-2xl border-0 p-0 sm:max-w-md">
              <form onSubmit={joinWorkspace} className="p-6 sm:p-7">
                <DialogHeader className="mb-6">
                  <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-[#f4ede8]">
                    <Icons.externalLink className="size-6 text-[#611f69]" />
                  </span>
                  <DialogTitle className="text-xl font-bold">
                    Join a workspace
                  </DialogTitle>
                  <DialogDescription>
                    Enter the workspace address or slug shared with you.
                  </DialogDescription>
                </DialogHeader>
                <label
                  htmlFor="workspace-slug"
                  className="mb-2 block text-sm font-semibold"
                >
                  Workspace address
                </label>
                <Input
                  id="workspace-slug"
                  autoFocus
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="workspace-slug"
                  className="h-11 rounded-lg"
                />
                {error && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <DialogFooter className="mt-6 border-0 bg-transparent p-0 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialog(null)}
                    className="rounded-lg"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={joining || !slug.trim()}
                    className="rounded-lg bg-[#611f69] text-white hover:bg-[#4a154b]"
                  >
                    {joining ? "Joining..." : "Join workspace"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </main>

      <footer className="border-t border-[#e8e3e7] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-12">
          <div className="mb-10 flex items-center gap-3">
            <SlackMark className="size-10" />
            <span className="text-lg font-bold tracking-tight">
              slack-clone
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-6">
            {footerGroups.map((group) => (
              <section key={group.title}>
                <h3 className="mb-4 text-sm font-bold">{group.title}</h3>
                <ul className="space-y-3">
                  {group.links.map(([label, href]) => (
                    <li key={label}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs leading-5 text-[#5e5a5f] hover:text-[#1264a3] hover:underline"
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="mt-12 flex flex-col gap-5 border-t border-[#e8e3e7] pt-6 text-xs text-[#5e5a5f] lg:flex-row lg:items-center lg:justify-between">
            <a
              href="https://slack.com/get?utm_source=website&utm_medium=global&utm_term=download-slack&utm_content=footer"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#1264a3] hover:underline"
            >
              Download Slack
            </a>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <a
                href="https://slack.com/trust/privacy/privacy-policy"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#1264a3]"
              >
                Privacy
              </a>
              <a
                href="https://slack.com/legal"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#1264a3]"
              >
                Terms
              </a>
              <a
                href="https://slack.com/#"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#1264a3]"
              >
                Cookie Preferences
              </a>
              <a
                href="https://www.salesforce.com/form/other/privacy-request/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#1264a3]"
              >
                Your Privacy Choices
              </a>
            </div>
            <p>©{new Date().getUTCFullYear()} <a href="https://github.com/mesewo/Slack-Clone/tree/main" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-[#1264a3] hover:underline">mesewo</a></p>
          </div>
          <p className="mt-2 text-[11px] text-[#777277]">
            Various trademarks held by their respective owners.
          </p>
        </div>
      </footer>
    </div>
  );
}
