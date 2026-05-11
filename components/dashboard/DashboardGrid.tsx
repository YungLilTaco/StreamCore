"use client";

import * as React from "react";
import { Responsive, WidthProvider, type Layout, type Layouts } from "react-grid-layout";
import { Plus, GripVertical } from "lucide-react";
import { cn } from "@/components/lib/cn";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";

import {
  defaultDashboardLayouts,
  DASHBOARD_DEFAULT_VISIBLE,
  DOCK_GRID_METRICS,
  dockLocksCanonicalJson,
  normalizeDashboardLayouts,
  parseDockLocksJson,
  parseStoredLayouts,
  replicateLayoutToAllBreakpoints,
  serializeLayouts,
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

/**
 * Storage keys. We share keys across grid versions because the persisted JSON is now wrapped in
 * a `{ __v, layouts }` envelope (see `parseStoredLayouts`), which means we can migrate v1
 * payloads in-place without juggling parallel keys.
 */
const STORAGE_KEY = "sv_streamcore_live_dashboard_layout_v1";
const STORAGE_VISIBLE_KEY = "sv_streamcore_live_dashboard_visible_v1";
const STORAGE_KEY_LEGACY = "sv_live_dashboard_layout_v1";
const STORAGE_VISIBLE_KEY_LEGACY = "sv_live_dashboard_visible_v1";

/**
 * v3 grid defaults (cols=128). A new dock dropped without a width hint spans 48 columns —
 * roughly a third of the viewport, matching the historical default proportion.
 */
const DEFAULT_DOCK_W = 48;
/** Dropping placeholder height (grid rows); individual docks use DOCK_GRID_METRICS.h. */
const DEFAULT_DROP_H = 12;
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

/** True iff `a` and `b` share any positive-area pixel. */
function rectsOverlap(a: Layout, b: Layout): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/**
 * Push `item` along an axis until it clears every obstacle, not just `intruder`.
 *
 * Used by `resolveCollision` so a shift candidate never "fixes" one overlap by creating
 * another. For example: a dock at minW that has to shift down because the intruder lands on
 * its left half — naively `newY = intruder.bottom`, but if another dock occupies that row
 * we'd silently overlap it. This helper repeatedly bumps the trial coordinate past any
 * obstacle still in the way, capping iteration at `obstacles.length + 1` (each obstacle can
 * push us at most once).
 *
 * Returns `null` when the resulting position would leave the legal range, e.g. shift-up
 * leaving `y < 0` or shift-right leaving `x + w > gridCols`. The caller drops the candidate.
 */
function pushUntilClear(
  item: Layout,
  axis: "x" | "y",
  startCoord: number,
  obstacles: Layout[],
  gridCols: number,
  direction: 1 | -1
): number | null {
  let coord = startCoord;
  for (let iter = 0; iter < obstacles.length + 2; iter++) {
    let moved = false;
    for (const other of obstacles) {
      // Synthesize the projected item position for overlap test.
      const projected: Layout = axis === "x" ? { ...item, x: coord } : { ...item, y: coord };
      if (!rectsOverlap(projected, other)) continue;

      if (axis === "x") {
        coord = direction === 1 ? other.x + other.w : other.x - item.w;
      } else {
        coord = direction === 1 ? other.y + other.h : other.y - item.h;
      }
      moved = true;
    }
    if (!moved) break;
  }

  // Bounds check. Vertical has no upper bound (RGL grows downward), but x must stay on grid
  // and either axis must stay non-negative.
  if (coord < 0) return null;
  if (axis === "x" && coord + item.w > gridCols) return null;
  return coord;
}

/**
 * "Fluid" collision resolution against a single intruder, aware of every other dock so its
 * choices never create *secondary* overlaps.
 *
 * Eight candidate moves are scored on a single cost axis:
 *
 *   Shrink:  cost = areaLost  (also rejected if it creates an overlap with another dock)
 *     - shrink right edge so item ends at intruder.left
 *     - shrink left edge so item starts at intruder.right
 *     - shrink bottom edge so item ends at intruder.top
 *     - shrink top edge so item starts at intruder.bottom
 *
 *   Shift:   cost = SHIFT_PENALTY + displacement
 *     - shift left/right/up/down using `pushUntilClear` to bypass any docks in the way
 *
 * `SHIFT_PENALTY` is strictly larger than any possible shrink cost, so shrinks always win when
 * at least one is legal AND conflict-free. Shifts already include the cumulative push past
 * blocking docks, so the resolver never returns a position that overlaps another dock — the
 * "zero overlap" guarantee.
 *
 * If every candidate is invalid (intruder buried inside a dock surrounded on every side by
 * locked docks at minimum width, all the way to the grid edges), the item is returned
 * unchanged. The cascading driver in `applyIntruderShrink` retries on subsequent passes;
 * pathological corner cases may still leave a residual overlap that the user can resolve
 * by dragging out manually.
 */
function resolveCollision(
  item: Layout,
  intruder: Layout,
  otherItems: Layout[],
  gridCols: number
): Layout {
  if (!rectsOverlap(item, intruder)) return item;

  const minW = item.minW ?? 1;
  const minH = item.minH ?? 1;
  const oldArea = item.w * item.h;
  const SHIFT_PENALTY = oldArea + 1;

  const intLeft = intruder.x;
  const intRight = intruder.x + intruder.w;
  const intTop = intruder.y;
  const intBottom = intruder.y + intruder.h;

  // Obstacles for shift candidates = everything else except this item and the intruder.
  const obstacles = otherItems.filter((o) => o.i !== item.i && o.i !== intruder.i);
  // For shrink-validity we also forbid the shrunk shape overlapping anything else.
  const noConflict = (projected: Layout): boolean =>
    !obstacles.some((o) => rectsOverlap(projected, o));

  type Opt = { cost: number; result: Layout };
  const opts: Opt[] = [];

  // --- Shrink candidates --------------------------------------------------
  const shrinkRight = intLeft - item.x;
  if (shrinkRight >= minW) {
    const r: Layout = { ...item, w: shrinkRight };
    if (noConflict(r)) opts.push({ cost: oldArea - shrinkRight * item.h, result: r });
  }
  const shrinkLeft = item.x + item.w - intRight;
  if (shrinkLeft >= minW) {
    const r: Layout = { ...item, x: intRight, w: shrinkLeft };
    if (noConflict(r)) opts.push({ cost: oldArea - shrinkLeft * item.h, result: r });
  }
  const shrinkBottom = intTop - item.y;
  if (shrinkBottom >= minH) {
    const r: Layout = { ...item, h: shrinkBottom };
    if (noConflict(r)) opts.push({ cost: oldArea - item.w * shrinkBottom, result: r });
  }
  const shrinkTop = item.y + item.h - intBottom;
  if (shrinkTop >= minH) {
    const r: Layout = { ...item, y: intBottom, h: shrinkTop };
    if (noConflict(r)) opts.push({ cost: oldArea - item.w * shrinkTop, result: r });
  }

  // --- Shift candidates ---------------------------------------------------
  // For shifts the intruder counts as an obstacle too — it's the dock we're shifting *away*
  // from, and we must not pass through it.
  const shiftObstacles = [intruder, ...obstacles];

  {
    const x = pushUntilClear(item, "x", intLeft - item.w, shiftObstacles, gridCols, -1);
    if (x !== null) {
      opts.push({ cost: SHIFT_PENALTY + Math.abs(x - item.x), result: { ...item, x } });
    }
  }
  {
    const x = pushUntilClear(item, "x", intRight, shiftObstacles, gridCols, 1);
    if (x !== null) {
      opts.push({ cost: SHIFT_PENALTY + Math.abs(x - item.x), result: { ...item, x } });
    }
  }
  {
    const y = pushUntilClear(item, "y", intTop - item.h, shiftObstacles, gridCols, -1);
    if (y !== null) {
      opts.push({ cost: SHIFT_PENALTY + Math.abs(y - item.y), result: { ...item, y } });
    }
  }
  {
    // Shift down is always legally bounded (no max-y) — push past any docks it lands on.
    const y = pushUntilClear(item, "y", intBottom, shiftObstacles, gridCols, 1);
    if (y !== null) {
      opts.push({ cost: SHIFT_PENALTY + Math.abs(y - item.y), result: { ...item, y } });
    }
  }

  let best: Opt | null = null;
  for (const o of opts) {
    if (best === null || o.cost < best.cost) best = o;
  }
  return best ? best.result : item;
}

/**
 * Resolve every overlap in the layout, treating `intruder` as fixed.
 *
 * Algorithm:
 *   - Replace any prior copy of the intruder with the new one (so its old position is freed).
 *   - Repeat up to MAX_PASSES:
 *       For each non-intruder, non-locked item, find the first item it overlaps with (the
 *       intruder takes priority — that's the dock the user just moved, so we want everything
 *       to give way to it first). Apply `resolveCollision` and write back if it changed.
 *   - Stop when a full pass yields no change.
 *
 * Locked items (`lockedIds`) are skipped — they can still be detected as opponents, but we
 * never modify them. If a locked item blocks all resolutions for some other item, that other
 * item may keep a residual overlap. With normal user behaviour this is extremely rare.
 */
function applyIntruderShrink(
  prevLayout: Layout[],
  intruder: Layout,
  gridCols: number,
  lockedIds?: ReadonlySet<string>
): Layout[] {
  const layout: Layout[] = [...prevLayout.filter((l) => l.i !== intruder.i), { ...intruder }];
  const MAX_PASSES = 16;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (let i = 0; i < layout.length; i++) {
      const it = layout[i];
      if (it.i === intruder.i) continue;
      if (lockedIds?.has(String(it.i))) continue;

      // Prefer the intruder as the opponent so docks always move *away from* the user's
      // active dock first — that produces the most predictable behaviour during a drag.
      let opponent: Layout | null = null;
      for (const other of layout) {
        if (other.i === it.i) continue;
        if (!rectsOverlap(it, other)) continue;
        opponent = other;
        if (other.i === intruder.i) break;
      }
      if (!opponent) continue;

      const resolved = resolveCollision(it, opponent, layout, gridCols);
      if (
        resolved.x !== it.x ||
        resolved.y !== it.y ||
        resolved.w !== it.w ||
        resolved.h !== it.h
      ) {
        layout[i] = resolved;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layout;
}

/** Width of the v3 grid in columns. Mirrors the `cols` prop passed to `ResponsiveGridLayout`. */
const GRID_COLS = 128;

/** Default grid with layout entries for every currently visible dock (one canonical lg row, replicated). */
function defaultLayoutsForVisible(visible: DockKey[]): Layouts {
  const base = cloneLayouts(defaultDashboardLayouts());
  let lg = ((base.lg ?? []) as Layout[]).slice();
  for (const key of visible) {
    if (!lg.some((l) => l.i === key)) {
      const maxY = lg.reduce((m, l) => Math.max(m, l.y + l.h), 0);
      const meta = DOCK_GRID_METRICS[key];
      lg.push({
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
  return replicateLayoutToAllBreakpoints(lg);
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
    const { channelTwitchId, ready } = useSelectedChannel();
    const [layouts, setLayouts] = React.useState<Layouts>(() =>
      normalizeDashboardLayouts(defaultDashboardLayouts())
    );
    const [visible, setVisible] = React.useState<DockKey[]>(DASHBOARD_DEFAULT_VISIBLE);
    const [dockLocks, setDockLocks] = React.useState<DockLocksState>({});
    const [persistEnabled, setPersistEnabled] = React.useState(false);

    const lastPersistedLayoutsRef = React.useRef<Layouts>(
      cloneLayouts(normalizeDashboardLayouts(defaultDashboardLayouts()))
    );
    const lastPersistedVisibleRef = React.useRef<DockKey[]>([...DASHBOARD_DEFAULT_VISIBLE]);
    const lastPersistedDockLocksRef = React.useRef<string>("{}");
    const baselineForChannelRef = React.useRef<string | null>(null);

    /**
     * Pre-drag layout snapshot.
     *
     * The fluid resolver computes shrink/shift from the layout the user *started* with — not
     * from the live state we're mutating during the drag. Otherwise, dragging back across an
     * already-shrunk dock would keep it shrunk forever and the user can't "back out". With this
     * ref, moving the intruder away from a dock returns that dock to its full size.
     *
     * Captured on drag/resize start, cleared on stop.
     */
    const dragOriginalLayoutRef = React.useRef<Layout[] | null>(null);

    /**
     * IDs of docks currently being resized or shifted by the resolver while the user drags.
     * Driven by `onDrag` / `onResize` and consumed by the wrapper divs (purple ring preview).
     * Cleared on drag/resize stop. We use Set semantics so JSX can check membership cheaply
     * during render.
     */
    const [shrinkingIds, setShrinkingIds] = React.useState<ReadonlySet<string>>(
      () => new Set()
    );

    React.useEffect(() => {
      try {
        const rawLayouts =
          window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY_LEGACY);
        const rawVisible =
          window.localStorage.getItem(STORAGE_VISIBLE_KEY) ??
          window.localStorage.getItem(STORAGE_VISIBLE_KEY_LEGACY);
        const rawLocked = window.localStorage.getItem(STORAGE_LOCKED_KEY);
        const parsed = parseStoredLayouts(rawLayouts);
        if (parsed) {
          const normalized = normalizeDashboardLayouts(parsed);
          setLayouts(replicateLayoutToAllBreakpoints(normalized.lg ?? []));
        }
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
        // Write the v2 versioned envelope so the next load short-circuits the migration path.
        window.localStorage.setItem(STORAGE_KEY, serializeLayouts(layouts));
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
            const nextLayouts = parseStoredLayouts(layout.layoutsJson);
            const nextVisible = JSON.parse(layout.visibleJson) as DockKey[];
            if (nextLayouts) {
              setLayouts(replicateLayoutToAllBreakpoints(normalizeDashboardLayouts(nextLayouts).lg ?? []));
            }
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
          // POSTed payload is an envelope ({__v, layouts}); unwrap before stashing the ref.
          const parsed = parseStoredLayouts(String(payload.layoutsJson));
          if (parsed) lastPersistedLayoutsRef.current = cloneLayouts(parsed);
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
        // Patch JSON is per-breakpoint and intentionally unwrapped (the server merges into the
        // envelope on read). Full-replacement saves go via `layoutsJson` and use the v2 envelope.
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

        const x = opts?.x ?? 0;
        const yBase = opts?.y;
        for (const bp of bps) {
          const arr = ((next[bp] ?? []) as Layout[]).slice();
          if (!arr.find((l) => l.i === key)) {
            const maxY = arr.reduce((m, l) => Math.max(m, l.y + l.h), 0);
            const y = yBase ?? maxY + 1;
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

    /** Locked dock ids as a Set so the resolver can skip them in O(1). */
    const lockedIds = React.useMemo<ReadonlySet<string>>(
      () => new Set(Object.keys(dockLocks).filter((k) => dockLocks[k as DockKey])),
      [dockLocks]
    );

    /**
     * Shared drag/resize reducer.
     *
     * Computes the projected layout from the pre-drag snapshot + the current intruder position,
     * applies it, and updates `shrinkingIds` so any dock whose size/position differs from its
     * snapshot gets the purple "I'm being adjusted" outline.
     *
     * The `commit` parameter switches between two operating modes:
     *   - `false` (during drag/resize): persisted state can be updated freely, but we don't
     *     clear the original-layout ref because more events are still coming.
     *   - `true` (on stop): final commit, also clears the ref and the shrinking-id set.
     */
    const applyIntruder = React.useCallback(
      (newItem: Layout, commit: boolean) => {
        const base =
          dragOriginalLayoutRef.current ??
          ((layouts.lg ?? []) as Layout[]).map(sanitizeLayoutItem);
        const intruder = sanitizeLayoutItem(newItem);
        const next = applyIntruderShrink(base, intruder, GRID_COLS, lockedIds);

        // Compute which non-intruder docks changed compared to the snapshot — they're the
        // ones the user should see highlighted.
        const adjusted = new Set<string>();
        for (const cur of next) {
          if (cur.i === intruder.i) continue;
          const prev = base.find((b) => b.i === cur.i);
          if (!prev) continue;
          if (prev.x !== cur.x || prev.y !== cur.y || prev.w !== cur.w || prev.h !== cur.h) {
            adjusted.add(String(cur.i));
          }
        }
        setShrinkingIds(adjusted);
        setLayouts(replicateLayoutToAllBreakpoints(next));

        if (commit) {
          dragOriginalLayoutRef.current = null;
          // Defer clearing the ring one frame so the user sees the final shape briefly.
          window.setTimeout(() => setShrinkingIds(new Set()), 80);
        }
      },
      [layouts, lockedIds]
    );

    const handleInteractionStart = React.useCallback(() => {
      dragOriginalLayoutRef.current = ((layouts.lg ?? []) as Layout[]).map(sanitizeLayoutItem);
    }, [layouts]);

    /**
     * Wrapper-div className for the dock identified by `key`.
     *
     * When the resolver has flagged the dock as currently being shrunk/shifted, we tag the
     * wrapper with `sv-dock-shrinking` so `globals.css` can render a soft purple outline
     * matching the placeholder. The base class keeps a smooth size transition so the dock
     * appears to *grow back* when the user pulls the intruder away from it.
     */
    const shrinkClass = React.useCallback(
      (key: DockKey) =>
        cn("sv-dock-wrap", shrinkingIds.has(key) && "sv-dock-shrinking"),
      [shrinkingIds]
    );

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

        <div className={cn("w-full px-3 py-6 sm:px-6")}>
          {/**
           * Grid behaviour summary:
           *   - `compactType={null}` + `allowOverlap` + `preventCollision={false}` → docks land
           *     exactly where the user drops them. No auto-snap to top, no vertical packing.
           *   - We don't use `onLayoutChange` here: it fires for every micro-update during a
           *     drag and would race with our fluid shrink reducer below. Layout state is the
           *     SOURCE OF TRUTH and we only mutate it on definitive events (drag stop, resize
           *     stop, drop, add/remove dock, reset).
           *   - `onDragStop` / `onResizeStop` / `onDrop` all funnel through `applyIntruderShrink`
           *     so the underlying dock(s) shrink toward the side where the intruder landed
           *     instead of being shoved across the grid.
           */}
          <ResponsiveGridLayout
            className="layout"
            layouts={layoutsForGrid}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            // v3 grid: 128 cols horizontally with a 4px x-margin pushes the horizontal snap step
            // to ≈12px on a typical desktop dashboard width (~1600px), which lines up with the
            // visible 12px page-background grid. Vertical rowHeight stays at 15px (+ 8px margin)
            // so dock heights don't visually compress on the upgrade.
            cols={{ lg: 128, md: 128, sm: 128, xs: 128, xxs: 128 }}
            rowHeight={15}
            margin={[4, 8]}
            containerPadding={[0, 0]}
            draggableHandle=".sv-drag-handle"
            draggableCancel="button, input, textarea, select, a, [role='combobox'], [data-rgl-no-drag]"
            // All 8 handles enabled — sides cover their full edge (see globals.css), corners
            // overlap on top with diagonal cursors for free 2D resize.
            resizeHandles={["s", "n", "w", "e", "sw", "se", "nw", "ne"]}
            isResizable
            isDraggable
            compactType={null}
            preventCollision={false}
            allowOverlap
            onDragStart={handleInteractionStart}
            onDrag={(_layout, _oldItem, newItem) => applyIntruder(newItem as Layout, false)}
            onDragStop={(_layout, _oldItem, newItem) => applyIntruder(newItem as Layout, true)}
            onResizeStart={handleInteractionStart}
            onResize={(_layout, _oldItem, newItem) => applyIntruder(newItem as Layout, false)}
            onResizeStop={(_layout, _oldItem, newItem) => applyIntruder(newItem as Layout, true)}
            isDroppable
            droppingItem={{ i: "__dropping__", w: DEFAULT_DOCK_W, h: DEFAULT_DROP_H }}
            onDrop={(_layout, item, e) => {
              const raw = (e as DragEvent)?.dataTransfer?.getData("application/x-streamcore-dock");
              const key = raw as DockKey;
              if (!raw) return;
              const meta = DOCK_GRID_METRICS[key];
              const intruder: Layout = {
                i: key,
                x: item.x,
                y: item.y,
                w: Math.max(item.w ?? DEFAULT_DOCK_W, meta.minW),
                h: Math.max(item.h ?? meta.h, meta.minH),
                minW: meta.minW,
                minH: meta.minH
              };
              // Make the dock visible and patch the layouts in one cohesive update so the new
              // dock arrives + neighbours shrink in the same frame.
              setVisible((v) => (v.includes(key) ? v : [...v, key]));
              setLayouts((prev) => {
                const base = ((prev.lg ?? []) as Layout[])
                  .filter((l) => l.i !== key)
                  .map(sanitizeLayoutItem);
                const next = applyIntruderShrink(base, intruder, GRID_COLS, lockedIds);
                return replicateLayoutToAllBreakpoints(next);
              });
              setDockMenuOpen(false);
            }}
          >
            {visible.includes("streamPreview") ? (
              <div key="streamPreview" className={shrinkClass("streamPreview")}>
                <StreamPreviewDock
                  onClose={() => hideDock("streamPreview")}
                  dockLocked={Boolean(dockLocks.streamPreview)}
                  onToggleDockLock={() => toggleDockLock("streamPreview")}
                />
              </div>
            ) : null}
            {visible.includes("liveChat") ? (
              <div key="liveChat" className={shrinkClass("liveChat")}>
                <LiveChatDock
                  onClose={() => hideDock("liveChat")}
                  dockLocked={Boolean(dockLocks.liveChat)}
                  onToggleDockLock={() => toggleDockLock("liveChat")}
                />
              </div>
            ) : null}
            {visible.includes("activityFeed") ? (
              <div key="activityFeed" className={shrinkClass("activityFeed")}>
                <ActivityFeedDock
                  onClose={() => hideDock("activityFeed")}
                  dockLocked={Boolean(dockLocks.activityFeed)}
                  onToggleDockLock={() => toggleDockLock("activityFeed")}
                />
              </div>
            ) : null}
            {visible.includes("quickActions") ? (
              <div key="quickActions" className={shrinkClass("quickActions")}>
                <QuickActionsDock
                  onClose={() => hideDock("quickActions")}
                  dockLocked={Boolean(dockLocks.quickActions)}
                  onToggleDockLock={() => toggleDockLock("quickActions")}
                />
              </div>
            ) : null}

            {visible.includes("quickClip") ? (
              <div key="quickClip" className={shrinkClass("quickClip")}>
                <QuickClipDock
                  onClose={() => hideDock("quickClip")}
                  dockLocked={Boolean(dockLocks.quickClip)}
                  onToggleDockLock={() => toggleDockLock("quickClip")}
                />
              </div>
            ) : null}
            {visible.includes("spotifyBridge") ? (
              <div key="spotifyBridge" className={shrinkClass("spotifyBridge")}>
                <SpotifyBridgeDock
                  onClose={() => hideDock("spotifyBridge")}
                  dockLocked={Boolean(dockLocks.spotifyBridge)}
                  onToggleDockLock={() => toggleDockLock("spotifyBridge")}
                />
              </div>
            ) : null}
            {visible.includes("soundMixer") ? (
              <div key="soundMixer" className={shrinkClass("soundMixer")}>
                <SoundMixerDock
                  onClose={() => hideDock("soundMixer")}
                  dockLocked={Boolean(dockLocks.soundMixer)}
                  onToggleDockLock={() => toggleDockLock("soundMixer")}
                />
              </div>
            ) : null}
            {visible.includes("streamInfo") ? (
              <div key="streamInfo" className={shrinkClass("streamInfo")}>
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
