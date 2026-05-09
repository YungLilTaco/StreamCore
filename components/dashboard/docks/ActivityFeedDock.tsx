"use client";

import * as React from "react";
import { Heart, Star, UserPlus } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";

type Event = { id: string; type: "follow" | "sub" | "raid"; text: string; at: string };

const initial: Event[] = [
  { id: "e1", type: "sub", text: "CyberPunk2077 subbed!", at: "Just now" },
  { id: "e2", type: "follow", text: "NeonRider followed", at: "2 mins ago" }
];

export function ActivityFeedDock({
  dragHandleProps,
  onClose
}: {
  dragHandleProps?: any;
  onClose?: () => void;
}) {
  const [events, setEvents] = React.useState<Event[]>(initial);

  React.useEffect(() => {
    const t = window.setInterval(() => {
      const kinds: Event["type"][] = ["follow", "sub", "raid"];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const id = "e" + Date.now();
      const text =
        kind === "follow"
          ? "PixelNomad followed"
          : kind === "sub"
            ? "SynthWaveExplorer gifted a sub!"
            : "NightCityWanderer raided with 42!";
      setEvents((e) => [{ id, type: kind, text, at: "Just now" }, ...e].slice(0, 12));
    }, 6500);
    return () => window.clearInterval(t);
  }, []);

  return (
    <DockShell title="Activity Feed" dragHandleProps={dragHandleProps} onClose={onClose}>
      <div className="h-full overflow-auto rounded-lg border border-white/10 bg-black/30 p-3">
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/10">
                <Icon type={e.type} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{e.text}</div>
                <div className="text-xs text-white/50">{e.at}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DockShell>
  );
}

function Icon({ type }: { type: Event["type"] }) {
  if (type === "follow") return <UserPlus className="h-4 w-4 text-sky-300" />;
  if (type === "sub") return <Star className="h-4 w-4 text-primary" />;
  return <Heart className="h-4 w-4 text-rose-300" />;
}

