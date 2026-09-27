"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CreateChannelDialogProps {
  existingChannelNames: string[];
  onCreateChannel: (name: string, type: "PUBLIC" | "PRIVATE") => Promise<void>;
  trigger: React.ReactNode;
}

function slugifyChannelName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function CreateChannelDialog({
  existingChannelNames,
  onCreateChannel,
  trigger,
}: CreateChannelDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<"PUBLIC" | "PRIVATE">(
    "PUBLIC",
  );
  const [inviteInput, setInviteInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const normalized = slugifyChannelName(channelName);
  const isDuplicate =
    normalized.length > 0 &&
    existingChannelNames.some(
      (name) => slugifyChannelName(name) === normalized,
    );
  const suggestions = normalized
    ? existingChannelNames
        .filter((name) => slugifyChannelName(name).includes(normalized))
        .slice(0, 5)
    : [];

  function reset() {
    setStep(1);
    setChannelName("");
    setChannelType("PUBLIC");
    setInviteInput("");
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleCreate() {
    setSubmitting(true);
    try {
      await onCreateChannel(normalized, channelType);
      handleOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.14em]">
            Step {step} of 2
          </p>
          <DialogTitle>
            {step === 1 ? "Create a channel" : "Add people"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Channels are where your team communicates. They're best organized around a topic."
              : "Bring teammates into this channel now, or skip and invite them later."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="new-channel-name"
                className="mb-1.5 block text-xs font-medium"
              >
                Name
              </label>
              <div className="relative">
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                  #
                </span>
                <Input
                  id="new-channel-name"
                  value={channelName}
                  onChange={(event) => setChannelName(event.target.value)}
                  placeholder="e.g. plan-budget"
                  aria-label="Channel name"
                  autoFocus
                  className="pl-6"
                />
              </div>
              {isDuplicate && (
                <p className="mt-1.5 text-xs text-destructive">
                  A channel named "{normalized}" already exists.
                </p>
              )}
              {!isDuplicate && suggestions.length > 0 && (
                <div className="border-border bg-popover mt-1.5 rounded-lg border p-1 shadow-sm">
                  <p className="text-muted-foreground px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em]">
                    Similar channels
                  </p>
                  {suggestions.map((name) => (
                    <div
                      key={name}
                      className="text-foreground/80 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
                    >
                      <span className="text-muted-foreground">#</span>
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-2.5">
              <div>
                <p className="text-sm font-medium">Make private</p>
                <p className="text-muted-foreground text-xs">
                  Only invited members can view this channel.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={channelType === "PRIVATE"}
                onClick={() =>
                  setChannelType((current) =>
                    current === "PRIVATE" ? "PUBLIC" : "PRIVATE",
                  )
                }
                className={cn(
                  "h-5 w-9 shrink-0 rounded-full transition-colors",
                  channelType === "PRIVATE" ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform",
                    channelType === "PRIVATE" && "translate-x-[18px]",
                  )}
                />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor="new-channel-invites"
              className="mb-1.5 block text-xs font-medium"
            >
              Invite by email (optional)
            </label>
            <Input
              id="new-channel-invites"
              value={inviteInput}
              onChange={(event) => setInviteInput(event.target.value)}
              placeholder="name@company.com"
              aria-label="Invite teammates by email"
            />
            <p className="text-muted-foreground text-xs">
              You can always add people to #{normalized || "channel-name"}{" "}
              later.
            </p>
          </div>
        )}

        <DialogFooter className="items-center justify-between sm:justify-between">
          {step === 2 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(1)}
              disabled={submitting}
            >
              Back
            </Button>
          ) : (
            <span />
          )}
          {step === 1 ? (
            <Button
              type="button"
              onClick={() => setStep(2)}
              disabled={!normalized || isDuplicate}
            >
              Next
            </Button>
          ) : (
            <Button type="button" onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creating..." : "Create channel"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
