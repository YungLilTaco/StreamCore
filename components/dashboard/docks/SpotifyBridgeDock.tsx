"use client";

import { Music2 } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";

export function SpotifyBridgeDock({
  dragHandleProps,
  onClose
}: {
  dragHandleProps?: any;
  onClose?: () => void;
}) {
  return (
    <DockShell title="Spotify Bridge" dragHandleProps={dragHandleProps} onClose={onClose}>
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-primary/20 via-black/40 to-sky-400/10" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">Vapor Trails</div>
            <div className="truncate text-xs text-white/55">SynthWave Explorer</div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[56%] rounded-full bg-primary" />
            </div>
          </div>
          <Music2 className="ml-auto h-5 w-5 text-primary" />
        </div>

        <div className="flex-1 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="text-xs font-semibold tracking-wider text-white/50">Song Request Queue</div>
          <div className="mt-3 space-y-2 text-sm">
            <QueueRow n="01" title="Neon Nights" by="AeroPulse" req="NeonRider" />
            <QueueRow n="02" title="Cyber Funk" by="GlitchedOut" req="Chat" />
            <QueueRow n="03" title="Midnight Run" by="PixelNomad" req="NightCityWanderer" />
          </div>
        </div>
      </div>
    </DockShell>
  );
}

function QueueRow({ n, title, by, req }: { n: string; title: string; by: string; req: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="w-8 text-xs text-white/45">{n}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-white">{title}</div>
        <div className="truncate text-xs text-white/55">
          {by} • Requested by: <span className="text-white/75">{req}</span>
        </div>
      </div>
    </div>
  );
}

