"use client";

import * as React from "react";
import { Responsive, WidthProvider, type Layout, type Layouts } from "react-grid-layout";
import { Plus, GripVertical } from "lucide-react";
import { cn } from "@/components/lib/cn";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import { appShellContentMaxWidthClass, useOptionalAppSidebar } from "@/components/app/AppSidebarContext";

import {
  defaultDashboardLayouts,
  DASHBOARD_DEFAULT_VISIBLE,
  DOCK_GRID_METRICS,
  dockLocksCanonicalJson,
  normalizeDashboardLayouts,
  parseDockLocksJson,
  type DashboardDockKey,
  type DockLocksState
} from "@/lib/dashboard-layout-defaults";

import { StreamPreviewDock } from "@/components/dashboard/docks/StreamPreviewDock";
import { LiveChatDock } from "@/components/dashboard/docks/LiveChatDock";
import { ActivityFeedDock } from "@/components/dashboard/docks/ActivityFeedDock";
import { QuickActionsDock } from "@/components/dashboard/docks/QuickActionsDock";
import { QuickClipDock } from "@/components/dashboard/docks/QuickClipDock";
import { SpotifyBridgeDock } from "@/components/dashboard/docks/SpotifyBridgeDock";
import { SoundMixerDock } from "@/components/dashboard/docks/SoundMixerDock";
import { StreamInfoDock } from "@/components/dashboard/docks/StreamInfoDock";

const ResponsiveGridLayout = WidthProvider(Responsive);

type DockKey = DashboardDockKey;

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

const STORAGE_KEY = "sv_streamcore_live_dashboard_layout_v1";
const STORAGE_VISIBLE_KEY = "sv_streamcore_live_dashboard_visible_v1";
const STORAGE_KEY_LEGACY = "sv_live_dashboard_layout_v1";
const STORAGE_VISIBLE_KEY_LEGACY = "sv_live_dashboard_visible_v1";

const DEFAULT_DOCK_W = 6;
/** Dropping placeholder height (grid rows); individual docks use DOCK_GRID_METRICS.h. */
const DEFAULT_DROP_H = 6;
const STORAGE_LOCKED_KEY = "sv_streamcore_live_dashboard_locked_v1";

const LAYOUT_KEYS: (keyof Layouts)[] = ["lg", "md", "sm", "xs", "xxs"];

function cloneLayouts(l: Layouts): Layouts {
  return JSON.parse(JSON.stringify(l)) as Layouts;
}

function sanitizeLayoutItem(item: Layout): Layout {
  const x = item as Layout & { static?: boolean; isDraggable?: boolean; isResizable?: boolean };
  const { static: _st, isDraggable: _d, isResizable: _r, ...rest } = x;
  return rest as Layout;
}

function sanitizeLayouts(all: Layouts): Layouts {
  const out = {} as Layouts;
  for (const k of LAYOUT_KEYS) {
    out[k] = ((all[k] ?? []) as Layout[]).map(sanitizeLayoutItem) as Layout[];
  }
  return out;
}

/** Merge per-dock lock as RGL `static` (disables drag + resize for that tile only). */
function applyDockLocks(layouts: Layouts, locks: DockLocksState): Layouts {
  const out = {} as Layouts;
  for (const bp of LAYOUT_KEYS) {
    out[bp] = ((layouts[bp] ?? []) as Layout[]).map((item) => {
      const clean = sanitizeLayoutItem(item);
      const key = item.i as DockKey;
      return locks[key] ? ({ ...clean, static: true } as Layout) : clean;
    }) as Layout[];
  }
  return out;
}

function layoutFingerprint(lo: Layout[] | undefined): string {
  const arr = [...(lo ?? [])].sort((a, b) => String(a.i).localeCompare(String(b.i)));
  const norm = arr.map(({ i, x, y, w, h, minW, minH, maxW, maxH }) => ({
    i,
    x,
    y,
    w,
    h,
    minW,
    minH,
    maxW,
    maxH
  }));
  return JSON.stringify(norm);
}

function breakpointsPatch(prev: Layouts, next: Layouts): Partial<Layouts> {
  const patch: Partial<Layouts> = {};
  for (const k of LAYOUT_KEYS) {
    if (layoutFingerprint(prev[k]) !== layoutFingerprint(next[k])) patch[k] = next[k];
  }
  return patch;
}

/** Default grid with layout entries for every currently visible dock. */
function defaultLayoutsForVisible(visible: DockKey[]): Layouts {
  let base = cloneLayouts(defaultDashboardLayouts());
  const bps = Object.keys(base) as (keyof Layouts)[];
  for (const bp of bps) {
    const arr = ((base[bp] ?? []) as Layout[]).slice();
    for (const key of visible) {
      if (!arr.some((l) => l.i === key)) {
        const maxY = arr.reduce((m, l) => Math.max(m, l.y + l.h), 0);
        const meta = DOCK_GRID_METRICS[key];
        arr.push({
          i: key,
          x: 0,
          y: maxY + 1,
          w: DEFAULT_DOCK_W,
          h: meta.h,
          minW: meta.minW,
          minH: meta.minH
        });
      }
    }
    base[bp] = arr;
  }
  return base;
}

export type DashboardGridHandle = {
  resetLayout: () => void;
};

type DashboardGridProps = {
  dockMenuOpen: boolean;
  setDockMenuOpen: (v: boolean) => void;
};

export const DashboardGrid = React.forwardRef<DashboardGridHandle, DashboardGridProps>(
  function DashboardGrid({ dockMenuOpen, setDockMenuOpen }, ref) {
    const appSidebar = useOptionalAppSidebar();
    const shellMax = appShellContentMaxWidthClass(Boolean(appSidebar?.sidebarCollapsed));
    const { channelTwitchId, ready } = useSelectedChannel();
    const [layouts, setLayouts] = React.useState<Layouts>(() =>
      normalizeDashboardLayouts(defaultDashboardLayouts())
    );
    const [visible, setVisible] = React.useState<DockKey[]>(DASHBOARD_DEFAULT_VISIBLE);
    const [breakpoint, setBreakpoint] = React.useState<keyof Layouts>("lg");
    const [dockLocks, setDockLocks] = React.useState<DockLocksState>({});
    const [persistEnabled, setPersistEnabled] = React.useState(false);

    const lastPersistedLayoutsRef = React.useRef<Layouts>(
      cloneLayouts(normalizeDashboardLayouts(defaultDashboardLayouts()))
    );
    const lastPersistedVisibleRef = React.useRef<DockKey[]>([...DASHBOARD_DEFAULT_VISIBLE]);
    const lastPersistedDockLocksRef = React.useRef<string>("{}");
    const baselineForChannelRef = React.useRef<string | null>(null);

    React.useEffect(() => {
      try {
        const rawLayouts =
          window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY_LEGACY);
        const rawVisible =
          window.localStorage.getItem(STORAGE_VISIBLE_KEY) ??
          window.localStorage.getItem(STORAGE_VISIBLE_KEY_LEGACY);
        const rawLocked = window.localStorage.getItem(STORAGE_LOCKED_KEY);
        if (rawLayouts)
          setLayouts(normalizeDashboardLayouts(JSON.parse(rawLayouts) as Layouts));
        if (rawVisible) setVisible(JSON.parse(rawVisible) as DockKey[]);
        if (rawLocked) {
          if (rawLocked === "0" || rawLocked === "1") setDockLocks({});
          else if (rawLocked.startsWith("{")) setDockLocks(parseDockLocksJson(rawLocked));
          else setDockLocks({});
        }
      } catch {
        // ignore
      }
    }, []);

    React.useEffect(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
        window.localStorage.setItem(STORAGE_VISIBLE_KEY, JSON.stringify(visible));
        window.localStorage.setItem(STORAGE_LOCKED_KEY, dockLocksCanonicalJson(dockLocks));
      } catch {
        // ignore
      }
    }, [layouts, visible, dockLocks]);

    React.useEffect(() => {
      if (!ready || !channelTwitchId) {
        setPersistEnabled(false);
        return;
      }
      setPersistEnabled(false);
      baselineForChannelRef.current = null;

      fetch(`/api/dashboard-layout?channelTwitchId=${encodeURIComponent(channelTwitchId)}`, {
        cache: "no-store"
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          const layout = json?.layout as
            | { layoutsJson: string; visibleJson: string; docksLockedJson?: string }
            | null
            | undefined;
          if (!layout) return;
          try {
            const nextLayouts = JSON.parse(layout.layoutsJson) as Layouts;
            const nextVisible = JSON.parse(layout.visibleJson) as DockKey[];
            setLayouts(normalizeDashboardLayouts(nextLayouts));
            setVisible(nextVisible);
            setDockLocks(parseDockLocksJson(layout.docksLockedJson));
          } catch {
            // ignore malformed DB row
          }
        })
        .catch(() => {})
        .finally(() => setPersistEnabled(true));
    }, [ready, channelTwitchId]);

    React.useLayoutEffect(() => {
      if (!persistEnabled || !channelTwitchId || !ready) return;
      if (baselineForChannelRef.current !== channelTwitchId) {
        baselineForChannelRef.current = channelTwitchId;
        lastPersistedLayoutsRef.current = cloneLayouts(layouts);
        lastPersistedVisibleRef.current = [...visible];
        lastPersistedDockLocksRef.current = dockLocksCanonicalJson(dockLocks);
      }
    }, [persistEnabled, channelTwitchId, ready, layouts, visible, dockLocks]);

    const persistToServer = React.useCallback(
      async (payload: Record<string, unknown>) => {
        const ch = channelTwitchId;
        if (!ch) return;
        const res = await fetch("/api/dashboard-layout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelTwitchId: ch, ...payload }),
          cache: "no-store"
        });
        if (!res.ok) return;
        if (payload.layoutsJson !== undefined) {
          lastPersistedLayoutsRef.current = cloneLayouts(JSON.parse(String(payload.layoutsJson)) as Layouts);
        } else if (payload.layoutsPatchJson !== undefined) {
          const patch = JSON.parse(String(payload.layoutsPatchJson)) as Partial<Layouts>;
          lastPersistedLayoutsRef.current = {
            ...lastPersistedLayoutsRef.current,
            ...patch
          } as Layouts;
        }
        if (payload.visibleJson !== undefined) {
          lastPersistedVisibleRef.current = JSON.parse(String(payload.visibleJson)) as DockKey[];
        }
        if (typeof payload.docksLockedJson === "string") {
          lastPersistedDockLocksRef.current = payload.docksLockedJson;
        }
      },
      [channelTwitchId]
    );

    React.useEffect(() => {
      if (!persistEnabled || !ready || !channelTwitchId) return;

      const t = window.setTimeout(() => {
        const prevL = lastPersistedLayoutsRef.current;
        const patch = breakpointsPatch(prevL, layouts);
        const visChanged = JSON.stringify(visible) !== JSON.stringify(lastPersistedVisibleRef.current);
        const lockJson = dockLocksCanonicalJson(dockLocks);
        const lockChanged = lockJson !== lastPersistedDockLocksRef.current;

        const body: Record<string, unknown> = {};
        if (Object.keys(patch).length) body.layoutsPatchJson = JSON.stringify(patch);
        if (visChanged) body.visibleJson = JSON.stringify(visible);
        if (lockChanged) body.docksLockedJson = lockJson;

        if (Object.keys(body).length === 0) return;
        void persistToServer(body);
      }, 600);

      return () => window.clearTimeout(t);
    }, [persistEnabled, ready, channelTwitchId, layouts, visible, dockLocks, persistToServer]);

    React.useImperativeHandle(
      ref,
      () => ({
        resetLayout: () => {
          if (!window.confirm("Reset dashboard layout to defaults? Your visible docks stay the same.")) {
            return;
          }
          const next = normalizeDashboardLayouts(defaultLayoutsForVisible(visible));
          setLayouts(next);
          setDockLocks({});
          if (!channelTwitchId || !ready) {
            lastPersistedLayoutsRef.current = cloneLayouts(next);
            lastPersistedDockLocksRef.current = "{}";
            return;
          }
          void persistToServer({
            layoutsJson: JSON.stringify(next),
            visibleJson: JSON.stringify(visible),
            docksLockedJson: "{}"
          });
        }
      }),
      [visible, channelTwitchId, ready, persistToServer]
    );

    function addDock(key: DockKey, opts?: { x?: number; y?: number; w?: number; h?: number }) {
      setVisible((v) => (v.includes(key) ? v : [...v, key]));
      const meta = DOCK_GRID_METRICS[key];
      const w = opts?.w ?? DEFAULT_DOCK_W;
      const h = opts?.h ?? meta.h;

      setLayouts((prev) => {
        const next: Layouts = { ...prev };
        const bps = Object.keys(next) as (keyof Layouts)[];

        for (const bp of bps) {
          const arr = ((next[bp] ?? []) as Layout[]).slice();
          if (!arr.find((l) => l.i === key)) {
            const maxY = arr.reduce((m, l) => Math.max(m, l.y + l.h), 0);
            const x = bp === breakpoint ? (opts?.x ?? 0) : 0;
            const y = bp === breakpoint ? (opts?.y ?? maxY + 1) : maxY + 1;
            arr.push({
              i: key,
              x,
              y,
              w,
              h: Math.max(h, meta.minH),
              minW: meta.minW,
              minH: meta.minH
            });
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

    const layoutsForGrid = React.useMemo(
      () => applyDockLocks(layouts, dockLocks),
      [layouts, dockLocks]
    );

    function toggleDockLock(key: DockKey) {
      setDockLocks((prev) => {
        const next = { ...prev };
        if (next[key]) delete next[key];
        else next[key] = true;
        return next;
      });
    }

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
                        e.dataTransfer.setData("application/x-streamcore-dock", d.key);
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

        <div
          className={cn(
            "mx-auto w-full px-3 py-6 transition-[max-width] duration-300 ease-out sm:px-4",
            shellMax
          )}
        >
          {/* RGL: preventCollision=true reverts moves/resizes on overlap; false + compact reflows neighbors. */}
          <ResponsiveGridLayout
            className="layout"
            layouts={layoutsForGrid}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 16, md: 12, sm: 6, xs: 6, xxs: 6 }}
            rowHeight={30}
            margin={[14, 14]}
            containerPadding={[0, 0]}
            draggableHandle=".sv-drag-handle"
            draggableCancel="button, input, textarea, select, a, [role='combobox'], [data-rgl-no-drag]"
            resizeHandles={["s", "w", "e", "sw", "se"]}
            onLayoutChange={(_current, all) => setLayouts(sanitizeLayouts(all))}
            onBreakpointChange={(bp) => setBreakpoint(bp as keyof Layouts)}
            isResizable
            isDraggable
            compactType="vertical"
            preventCollision={false}
            allowOverlap={false}
            isDroppable
            droppingItem={{ i: "__dropping__", w: DEFAULT_DOCK_W, h: DEFAULT_DROP_H }}
            onDrop={(_layout, item, e) => {
              const raw = (e as DragEvent)?.dataTransfer?.getData("application/x-streamcore-dock");
              const key = raw as DockKey;
              if (!raw) return;
              addDock(key, { x: item.x, y: item.y, w: item.w, h: item.h });
            }}
          >
            {visible.includes("streamPreview") ? (
              <div key="streamPreview">
                <StreamPreviewDock
                  onClose={() => hideDock("streamPreview")}
                  dockLocked={Boolean(dockLocks.streamPreview)}
                  onToggleDockLock={() => toggleDockLock("streamPreview")}
                />
              </div>
            ) : null}
            {visible.includes("liveChat") ? (
              <div key="liveChat">
                <LiveChatDock
                  onClose={() => hideDock("liveChat")}
                  dockLocked={Boolean(dockLocks.liveChat)}
                  onToggleDockLock={() => toggleDockLock("liveChat")}
                />
              </div>
            ) : null}
            {visible.includes("activityFeed") ? (
              <div key="activityFeed">
                <ActivityFeedDock
                  onClose={() => hideDock("activityFeed")}
                  dockLocked={Boolean(dockLocks.activityFeed)}
                  onToggleDockLock={() => toggleDockLock("activityFeed")}
                />
              </div>
            ) : null}
            {visible.includes("quickActions") ? (
              <div key="quickActions">
                <QuickActionsDock
                  onClose={() => hideDock("quickActions")}
                  dockLocked={Boolean(dockLocks.quickActions)}
                  onToggleDockLock={() => toggleDockLock("quickActions")}
                />
              </div>
            ) : null}

            {visible.includes("quickClip") ? (
              <div key="quickClip">
                <QuickClipDock
                  onClose={() => hideDock("quickClip")}
                  dockLocked={Boolean(dockLocks.quickClip)}
                  onToggleDockLock={() => toggleDockLock("quickClip")}
                />
              </div>
            ) : null}
            {visible.includes("spotifyBridge") ? (
              <div key="spotifyBridge">
                <SpotifyBridgeDock
                  onClose={() => hideDock("spotifyBridge")}
                  dockLocked={Boolean(dockLocks.spotifyBridge)}
                  onToggleDockLock={() => toggleDockLock("spotifyBridge")}
                />
              </div>
            ) : null}
            {visible.includes("soundMixer") ? (
              <div key="soundMixer">
                <SoundMixerDock
                  onClose={() => hideDock("soundMixer")}
                  dockLocked={Boolean(dockLocks.soundMixer)}
                  onToggleDockLock={() => toggleDockLock("soundMixer")}
                />
              </div>
            ) : null}
            {visible.includes("streamInfo") ? (
              <div key="streamInfo">
                <StreamInfoDock
                  onClose={() => hideDock("streamInfo")}
                  dockLocked={Boolean(dockLocks.streamInfo)}
                  onToggleDockLock={() => toggleDockLock("streamInfo")}
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
);
