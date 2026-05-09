"use client";

import * as React from "react";
import { Scissors, CheckCircle2 } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { Button } from "@/components/ui/button";

export function QuickClipDock({
  dragHandleProps,
  onClose
}: {
  dragHandleProps?: any;
  onClose?: () => void;
}) {
  const [ok, setOk] = React.useState(false);

  return (
    <DockShell
      title="Quick Clip"
      right={
        ok ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            Clip created
          </span>
        ) : null
      }
      dragHandleProps={dragHandleProps}
      onClose={onClose}
    >
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Button
          variant="primary"
          className="h-14 w-full max-w-sm text-base shadow-glow-purple"
          onClick={() => {
            setOk(true);
            window.setTimeout(() => setOk(false), 2200);
          }}
        >
          <Scissors className="h-5 w-5" />
          CLIP LAST 30S
        </Button>
        <div className="text-xs text-white/55">Mock action (notification only).</div>
      </div>
    </DockShell>
  );
}

