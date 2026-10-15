import type { ComponentType } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export function SectionIcon({
  icon: Icon,
  open,
}: {
  icon: ComponentType<{ className?: string }>;
  open: boolean;
}) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <Icon className="absolute size-4 transition-opacity group-hover/row:opacity-0" />
      <IconChevronDown
        className={cn(
          "absolute size-4 opacity-0 transition-all group-hover/row:opacity-100",
          !open && "-rotate-90",
        )}
      />
    </span>
  );
}
