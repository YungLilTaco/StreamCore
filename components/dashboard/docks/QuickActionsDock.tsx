"use client";

import * as React from "react";
import { Eraser, Megaphone, BarChartHorizontal, BadgePercent } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { Button } from "@/components/ui/button";

export function QuickActionsDock({
  dragHandleProps,
  onClose
}: {
  dragHandleProps?: any;
  onClose?: () => void;
}) {
  const [toast, setToast] = React.useState<string | null>(null);

  function notify(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }

  return (
    <DockShell
      title="Quick Actions"
      right={
        toast ? (
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/70">
            {toast}
          </div>
        ) : null
      }
      dragHandleProps={dragHandleProps}
      onClose={onClose}
    >
      <div className="flex h-full flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => notify("Shoutout sent")}>
            <Megaphone className="h-4 w-4" />
            Shoutout
          </Button>
          <Button variant="secondary" onClick={() => notify("Chat cleared")}>
            <Eraser className="h-4 w-4" />
            Clear Chat
          </Button>
          <Button variant="secondary" onClick={() => notify("Poll started")}>
            <BarChartHorizontal className="h-4 w-4" />
            Start Poll
          </Button>
          <Button
            variant="primary"
            className="shadow-glow-purple"
            onClick={() => notify("Running 60s ad…")}
          >
            <BadgePercent className="h-4 w-4" />
            Run 60s Ad
          </Button>
        </div>

        <div className="mt-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/60">
          ModView logic: actions are instant, visible, and never hide your chat.
        </div>
      </div>
    </DockShell>
  );
}

