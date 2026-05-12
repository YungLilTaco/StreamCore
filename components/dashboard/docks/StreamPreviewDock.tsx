"use client";

import { Signal, Wifi } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";

export function StreamPreviewDock({
  dragHandleProps,
  onClose,
  dockLocked,
  onToggleDockLock
}: {
  dragHandleProps?: any;
  onClose?: () => void;
  dockLocked?: boolean;
  onToggleDockLock?: () => void;
}) {
  return (
    <DockShell
      title="Stream Preview"
      right={
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="hidden sm:inline">12.4k viewers</span>
        </div>
      }
      dragHandleProps={dragHandleProps}
      onClose={onClose}
      dockLocked={dockLocked}
      onToggleDockLock={onToggleDockLock}
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="relative min-h-[148px] flex-1 overflow-hidden rounded-lg border border-white/10 bg-black/50">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-sky-400/10" />
          <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-white/70 backdrop-blur">
            <Signal className="h-3.5 w-3.5 text-primary" />
            Preview (mock)
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/70 backdrop-blur">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-white/70" />
              <span>Bitrate: 6000 kbps</span>
            </div>
            <span className="text-emerald-200">Health: Good</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <Mini label="Dropped" value="0.1%" />
          <Mini label="FPS" value="60" />
          <Mini label="RTT" value="38ms" />
        </div>
      </div>
    </DockShell>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
      <div className="text-white/50">{label}</div>
      <div className="mt-1 font-semibold text-white">{value}</div>
    </div>
  );
}

