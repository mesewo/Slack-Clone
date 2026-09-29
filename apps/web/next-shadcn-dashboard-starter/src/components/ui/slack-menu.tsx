import { cn } from "@/lib/utils";

export function SlackMenu({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-72 rounded-xl border border-white/10 bg-[#1a1d21] p-1.5 text-white shadow-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SlackMenuItem({
  icon,
  title,
  description,
  shortcut,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  shortcut?: string;
  badge?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-white/10"
    >
      <span className="mt-0.5 text-white/70">{icon}</span>
      <span className="flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {badge && (
            <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-amber-300">
              {badge}
            </span>
          )}
        </span>
        {description && (
          <span className="block text-xs text-white/50">{description}</span>
        )}
      </span>
      {shortcut && <span className="text-xs text-white/40">{shortcut}</span>}
    </button>
  );
}

export function SlackMenuDivider() {
  return <div className="my-1.5 h-px bg-white/10" />;
}
