"use client";

import * as React from "react";
import { Responsive, WidthProvider, type Layout, type Layouts } from "react-grid-layout";
import { Plus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/cn";

import { StreamPreviewDock } from "@/components/dashboard/docks/StreamPreviewDock";
import { LiveChatDock } from "@/components/dashboard/docks/LiveChatDock";
import { ActivityFeedDock } from "@/components/dashboard/docks/ActivityFeedDock";
import { QuickActionsDock } from "@/components/dashboard/docks/QuickActionsDock";
import { QuickClipDock } from "@/components/dashboard/docks/QuickClipDock";
import { SpotifyBridgeDock } from "@/components/dashboard/docks/SpotifyBridgeDock";
import { SoundMixerDock } from "@/components/dashboard/docks/SoundMixerDock";
import { StreamInfoDock } from "@/components/dashboard/docks/StreamInfoDock";

const ResponsiveGridLayout = WidthProvider(Responsive);

type DockKey =
  | "streamPreview"
  | "liveChat"
  | "activityFeed"
  | "quickActions"
  | "quickClip"
  | "spotifyBridge"
  | "soundMixer"
  | "streamInfo";

const DOCKS: { key: DockKey; name: string }[] = [
  { key: "streamPreview", name: "Stream Preview" },
  { key: "liveChat", name: "Live Stream Chat" },
  { key: "activityFeed", name: "Activity Feed" },
  { key: "quickActions", name: "Quick Actions" },
  { key: "quickClip", name: "Quick Clip" },
  { key: "spotifyBridge", name: "Spotify Bridge" },
  { key: "soundMixer", name: "Sound Mixer" },
  { key: "streamInfo", name: "Stream Info" }
];

const STORAGE_KEY = "sv_live_dashboard_layout_v1";
const STORAGE_VISIBLE_KEY = "sv_live_dashboard_visible_v1";

const defaultVisible: DockKey[] = ["streamPreview", "liveChat", "activityFeed", "quickActions"];
const DEFAULT_DOCK_W = 6;
const DEFAULT_DOCK_H = 6;

function defaultLayouts(): Layouts {
  const lg: Layout[] = [
    { i: "streamPreview", x: 0, y: 0, w: 6, h: 8, minW: 4, minH: 6 },
    { i: "liveChat", x: 6, y: 0, w: 6, h: 8, minW: 4, minH: 6 },
    { i: "activityFeed", x: 12, y: 0, w: 4, h: 8, minW: 3, minH: 6 },
    { i: "quickActions", x: 0, y: 8, w: 8, h: 5, minW: 4, minH: 4 }
  ];
  const md: Layout[] = [
    { i: "streamPreview", x: 0, y: 0, w: 6, h: 8 },
    { i: "liveChat", x: 6, y: 0, w: 6, h: 8 },
    { i: "activityFeed", x: 0, y: 8, w: 6, h: 7 },
    { i: "quickActions", x: 6, y: 8, w: 6, h: 6 }
  ];
  const sm: Layout[] = [
    { i: "streamPreview", x: 0, y: 0, w: 6, h: 7 },
    { i: "liveChat", x: 0, y: 7, w: 6, h: 7 },
    { i: "activityFeed", x: 0, y: 14, w: 6, h: 7 },
    { i: "quickActions", x: 0, y: 21, w: 6, h: 6 }
  ];

  return { lg, md, sm, xs: sm, xxs: sm };
}

export function DashboardGrid({
  dockMenuOpen,
  setDockMenuOpen
}: {
  dockMenuOpen: boolean;
  setDockMenuOpen: (v: boolean) => void;
}) {
  const [layouts, setLayouts] = React.useState<Layouts>(() => defaultLayouts());
  const [visible, setVisible] = React.useState<DockKey[]>(defaultVisible);
  const [breakpoint, setBreakpoint] = React.useState<keyof Layouts>("lg");

  React.useEffect(() => {
    try {
      const rawLayouts = window.localStorage.getItem(STORAGE_KEY);
      const rawVisible = window.localStorage.getItem(STORAGE_VISIBLE_KEY);
      if (rawLayouts) setLayouts(JSON.parse(rawLayouts) as Layouts);
      if (rawVisible) setVisible(JSON.parse(rawVisible) as DockKey[]);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
      window.localStorage.setItem(STORAGE_VISIBLE_KEY, JSON.stringify(visible));
    } catch {
      // ignore
    }
  }, [layouts, visible]);

  function layoutFor(bp: keyof Layouts): Layout[] {
    return ((layouts[bp] ?? []) as Layout[]).slice();
  }

  function ensureInLayouts(key: DockKey) {
    // If missing, append at bottom for each breakpoint.
    setLayouts((prev) => {
      const next: Layouts = { ...prev };
      const bps = Object.keys(next) as (keyof Layouts)[];
      for (const bp of bps) {
        const arr = (next[bp] ?? []) as Layout[];
        if (!arr.find((l) => l.i === key)) {
          const maxY = arr.reduce((m, l) => Math.max(m, l.y + l.h), 0);
          arr.push({ i: key, x: 0, y: maxY + 1, w: 6, h: 6, minW: 3, minH: 4 });
        }
        next[bp] = arr;
      }
      return next;
    });
  }

  function addDock(key: DockKey, opts?: { x?: number; y?: number; w?: number; h?: number }) {
    setVisible((v) => (v.includes(key) ? v : [...v, key]));
    const w = opts?.w ?? DEFAULT_DOCK_W;
    const h = opts?.h ?? DEFAULT_DOCK_H;

    setLayouts((prev) => {
      const next: Layouts = { ...prev };
      const bps = Object.keys(next) as (keyof Layouts)[];

      for (const bp of bps) {
        const arr = ((next[bp] ?? []) as Layout[]).slice();
        if (!arr.find((l) => l.i === key)) {
          const maxY = arr.reduce((m, l) => Math.max(m, l.y + l.h), 0);
          const x = bp === breakpoint ? (opts?.x ?? 0) : 0;
          const y = bp === breakpoint ? (opts?.y ?? maxY + 1) : maxY + 1;
          arr.push({ i: key, x, y, w, h, minW: 3, minH: 4 });
        }
        next[bp] = arr;
      }
      return next;
    });
    setDockMenuOpen(false);
  }

  function hideDock(key: DockKey) {
    setVisible((v) => v.filter((x) => x !== key));
  }

  const hidden = DOCKS.filter((d) => !visible.includes(d.key));

  return (
    <div className="relative">
      {dockMenuOpen ? (
        <div className="absolute right-4 top-4 z-50 w-[320px] overflow-hidden rounded-lg border border-white/10 bg-black/60 backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="text-sm font-semibold text-white">Add Dock</div>
            <button
              className="text-xs text-white/60 hover:text-white"
              onClick={() => setDockMenuOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="p-2">
            <div className="px-3 pb-2 text-xs text-white/55">
              Drag a dock into the grid, or click to add.
            </div>
            {hidden.length ? (
              <div className="space-y-1">
                {hidden.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => addDock(d.key)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-streamvault-dock", d.key);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm",
                      "text-white/75 hover:bg-white/[0.05] hover:text-white"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-white/40" />
                      {d.name}
                    </span>
                    <Plus className="h-4 w-4 text-primary" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-6 text-sm text-white/60">All docks are already visible.</div>
            )}
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[1480px] px-4 py-6">
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 16, md: 12, sm: 6, xs: 6, xxs: 6 }}
          rowHeight={34}
          margin={[14, 14]}
          containerPadding={[0, 0]}
          draggableHandle=".sv-drag-handle"
          onLayoutsChange={(next) => setLayouts(next)}
          onBreakpointChange={(bp) => setBreakpoint(bp as keyof Layouts)}
          isResizable
          isDraggable
          compactType="vertical"
          isDroppable
          droppingItem={{ i: "__dropping__", w: DEFAULT_DOCK_W, h: DEFAULT_DOCK_H }}
          onDrop={(_layout, item, e) => {
            const raw = e?.dataTransfer?.getData("application/x-streamvault-dock");
            const key = raw as DockKey;
            if (!raw) return;
            addDock(key, { x: item.x, y: item.y, w: item.w, h: item.h });
          }}
        >
          {visible.includes("streamPreview") ? (
            <div key="streamPreview">
              <StreamPreviewDock
                dragHandleProps={{ className: "sv-drag-handle" }}
                onClose={() => hideDock("streamPreview")}
              />
            </div>
          ) : null}
          {visible.includes("liveChat") ? (
            <div key="liveChat">
              <LiveChatDock
                dragHandleProps={{ className: "sv-drag-handle" }}
                onClose={() => hideDock("liveChat")}
              />
            </div>
          ) : null}
          {visible.includes("activityFeed") ? (
            <div key="activityFeed">
              <ActivityFeedDock
                dragHandleProps={{ className: "sv-drag-handle" }}
                onClose={() => hideDock("activityFeed")}
              />
            </div>
          ) : null}
          {visible.includes("quickActions") ? (
            <div key="quickActions">
              <QuickActionsDock
                dragHandleProps={{ className: "sv-drag-handle" }}
                onClose={() => hideDock("quickActions")}
              />
            </div>
          ) : null}

          {visible.includes("quickClip") ? (
            <div key="quickClip">
              <QuickClipDock
                dragHandleProps={{ className: "sv-drag-handle" }}
                onClose={() => hideDock("quickClip")}
              />
            </div>
          ) : null}
          {visible.includes("spotifyBridge") ? (
            <div key="spotifyBridge">
              <SpotifyBridgeDock
                dragHandleProps={{ className: "sv-drag-handle" }}
                onClose={() => hideDock("spotifyBridge")}
              />
            </div>
          ) : null}
          {visible.includes("soundMixer") ? (
            <div key="soundMixer">
              <SoundMixerDock
                dragHandleProps={{ className: "sv-drag-handle" }}
                onClose={() => hideDock("soundMixer")}
              />
            </div>
          ) : null}
          {visible.includes("streamInfo") ? (
            <div key="streamInfo">
              <StreamInfoDock
                dragHandleProps={{ className: "sv-drag-handle" }}
                onClose={() => hideDock("streamInfo")}
              />
            </div>
          ) : null}
        </ResponsiveGridLayout>

        <div className="mt-4 text-xs text-white/45">
          Tip: Use the dock’s (X) button to close it. Re-add it from “Add Dock”.
        </div>
      </div>
    </div>
  );
}

