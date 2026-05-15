"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Responsive, WidthProvider, type Layout, type Layouts } from "react-grid-layout";
import { cn } from "@/components/lib/cn";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";

import {
  DASHBOARD_GRID_COLS,
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
import { ChatDock } from "@/components/dashboard/docks/ChatDock";
import { RewardsQueueDock } from "@/components/dashboard/docks/RewardsQueueDock";
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
  { key: "rewardsQueue", name: "Reward Queue" },
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

/** v4 grid (12 cols): new docks span half the dashboard width unless dropped with a width hint. */
const DEFAULT_DOCK_W = 6;
/** Dropping placeholder height (grid rows); individual docks use DOCK_GRID_METRICS.h. */
const DEFAULT_DROP_H = 12;
const STORAGE_LOCKED_KEY = "sv_streamcore_live_dashboard_locked_v1";

const LAYOUT_KEYS: (keyof Layouts)[] = ["lg", "md", "sm", "xs", "xxs"];

function cloneLayouts(l: Layouts): Layouts {
  return JSON.parse(JSON.stringify(l)) as Layouts;
}

function sanitizeLayoutItem(item: Layout): Layout {
  const x = item as Layout & {
    static?: boolean;
    isDraggable?: boolean;
    maxW?: number;
    maxH?: number;
  };
  const { static: _st, isDraggable: _d, isResizable: _r, maxW: _mw, maxH: _mh, ...rest } = x;
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
 * Find the first top-left grid slot that fits `w×h`, scanning top-to-bottom so the plus-menu can
 * always insert even when the bottom row is visually "full" of overlapping legacy tiles.
 * Falls back to stacking below the lowest occupied row.
 */
function pickAddDockOrigin(base: Layout[], w: number, h: number, gridCols: number): { x: number; y: number } {
  const maxY = base.reduce((m, l) => Math.max(m, l.y + l.h), 0);
  const scanMaxY = Math.max(maxY + 32, 40);
  for (let y = 0; y < scanMaxY; y++) {
    for (let x = 0; x <= gridCols - w; x++) {
      const probe: Layout = { i: "__probe__", x, y, w, h, minW: 1, minH: 1 };
      if (!base.some((o) => rectsOverlap(probe, o))) return { x, y };
    }
  }
  return { x: 0, y: maxY + 1 };
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

/** Width of the v4 grid in columns (OBS-style). Mirrors `cols` on `ResponsiveGridLayout`. */
const GRID_COLS = DASHBOARD_GRID_COLS;

/**
 * Edge-to-edge packer used by the "Fill dashboard row gaps" toggle.
 *
 * Alternates vertical-pack (push every movable item up until it hits an obstacle or y=0) and
 * horizontal-pack (push every movable item left until it hits an obstacle or x=0). Locked
 * docks are treated as fixed obstacles — they never move, but movables are allowed to slide
 * around them. We iterate the two passes until a complete round produces no change (or six
 * rounds, whichever comes first), so a horizontal slide that frees up vertical space gets a
 * chance to settle on the next pass.
 *
 * Why a custom packer instead of relying on RGL's `compactType="vertical"`: RGL only packs on
 * the vertical axis. The user-facing requirement is OBS-style edge-to-edge filling on *both*
 * axes, so neighbours pull together horizontally as well as upward.
 */
function packLayoutEdgeToEdge(items: Layout[], lockedIds?: ReadonlySet<string>): Layout[] {
  const locks = lockedIds ?? new Set<string>();
  const lockedItems = items.filter((it) => locks.has(String(it.i))).map((it) => ({ ...it }));
  const movables = items.filter((it) => !locks.has(String(it.i))).map((it) => ({ ...it }));

  for (let pass = 0; pass < 6; pass++) {
    let changed = false;

    movables.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const item of movables) {
      let y = 0;
      while (true) {
        const trial: Layout = { ...item, y };
        const conflict =
          lockedItems.find((o) => rectsOverlap(trial, o)) ??
          movables.find((o) => o.i !== item.i && rectsOverlap(trial, o));
        if (!conflict) break;
        y = conflict.y + conflict.h;
      }
      if (y !== item.y) {
        item.y = y;
        changed = true;
      }
    }

    movables.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const item of movables) {
      const originalX = item.x;
      let x = 0;
      while (true) {
        const trial: Layout = { ...item, x };
        const conflict =
          lockedItems.find((o) => rectsOverlap(trial, o)) ??
          movables.find((o) => o.i !== item.i && rectsOverlap(trial, o));
        if (!conflict) break;
        x = conflict.x + conflict.w;
        if (x + item.w > GRID_COLS) {
          // Doesn't fit on this row going further right — leave it where it was.
          x = originalX;
          break;
        }
      }
      if (x !== item.x) {
        item.x = x;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return [...lockedItems, ...movables];
}

/**
 * When “fill gaps” is on, grow each unlocked dock into adjacent empty space so rows/columns
 * read edge-to-edge like OBS, without overlapping other tiles.
 */
function expandLayoutFillGaps(items: Layout[], gridCols: number, lockedIds?: ReadonlySet<string>): Layout[] {
  const locks = lockedIds ?? new Set<string>();
  const result = items.map((it) => ({ ...sanitizeLayoutItem(it) }));

  for (let pass = 0; pass < 12; pass++) {
    /** Bottom edge of the bounding box — never grow a tile past empty space below the layout (avoids an infinite h loop). */
    const maxBottom = result.reduce((m, o) => Math.max(m, o.y + o.h), 0);
    let changed = false;
    const order = [...result].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const item of order) {
      if (locks.has(String(item.i))) continue;
      const idx = result.findIndex((r) => r.i === item.i);
      if (idx < 0) continue;

      while (item.x + item.w < gridCols) {
        const trial: Layout = { ...item, w: item.w + 1 };
        if (result.some((o) => o.i !== item.i && rectsOverlap(trial, o))) break;
        item.w += 1;
        result[idx] = { ...item };
        changed = true;
      }

      while (item.x > 0) {
        const trial: Layout = { ...item, x: item.x - 1, w: item.w + 1 };
        if (trial.x + trial.w > gridCols) break;
        if (result.some((o) => o.i !== item.i && rectsOverlap(trial, o))) break;
        item.x -= 1;
        item.w += 1;
        result[idx] = { ...item };
        changed = true;
      }

      while (item.y + item.h < maxBottom) {
        const trial: Layout = { ...item, h: item.h + 1 };
        if (result.some((o) => o.i !== item.i && rectsOverlap(trial, o))) break;
        item.h += 1;
        result[idx] = { ...item };
        changed = true;
      }
    }
    if (!changed) break;
  }

  return result;
}

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
  fillRowGaps: boolean;
  onFillRowGapsChange: (next: boolean) => void;
};

export const DashboardGrid = React.forwardRef<DashboardGridHandle, DashboardGridProps>(
  function DashboardGrid({ dockMenuOpen, setDockMenuOpen, fillRowGaps, onFillRowGapsChange }, ref) {
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
    const lastPersistedFillRowGapsRef = React.useRef<boolean>(false);
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

    /**
     * Resolver-projected layout shown as an overlay outline during an in-flight gesture.
     *
     * The bottom dock is supposed to read "outline = where I'm going, faded body = where I am
     * right now". To pull that off, the live `layouts` state keeps every non-intruder dock at
     * its pre-drag size (so the dock body literally doesn't move), while this state holds the
     * resolver's full output for the same frame. We then draw an absolute-positioned outline
     * for each `shrinkingIds` member at its projected slot. On gesture stop, the resolver
     * output is committed into `layouts` and this state is cleared.
     */
    const [projectedLayout, setProjectedLayout] = React.useState<Layout[] | null>(null);

    /**
     * Wrapper element around `ResponsiveGridLayout`. The wrapper exists purely to anchor the
     * absolute-positioned outline overlay below — it's `position: relative`, has no padding or
     * border, and inherits its width from the parent, which means the overlay's `calc(100%…)`
     * expressions resolve against the exact same width that RGL itself sees for the grid (both
     * read the same parent content width). We *don't* need a measured pixel width anywhere in
     * React, which sidesteps a whole class of HMR/timing bugs.
     */

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

    /**
     * Persist layout state to `localStorage` — debounced and gesture-gated.
     *
     * Why this isn't a naïve `useEffect` that fires on every state change:
     *   - During a drag/resize, `layouts` updates ~60×/sec. Three synchronous `localStorage`
     *     writes per tick (≈180/sec, each ~1-3ms of JSON.stringify + main-thread IO) was the
     *     biggest single contributor to drag lag and rubber-banding.
     *   - localStorage is only consulted on initial mount as a faster-than-network warm cache.
     *     There's no consumer that needs sub-second freshness, so a 500ms debounce is
     *     indistinguishable from "instant" for the user and saves ~150 writes per drag.
     *   - We also skip writes entirely while a gesture is active (`projectedLayout` is set);
     *     the commit at gesture stop fires the effect once with the final values.
     *
     * Each of the three storage entries is compared against its last-written serialized form
     * before issuing a `setItem` so unrelated state churn (e.g. visible array unchanged but
     * `layouts` moved) doesn't trigger a redundant write of the unchanged blob.
     */
    const localStorageWrittenRef = React.useRef<{
      layouts: string | null;
      visible: string | null;
      locks: string | null;
    }>({ layouts: null, visible: null, locks: null });

    React.useEffect(() => {
      if (projectedLayout) return; // mid-gesture, defer
      const handle = window.setTimeout(() => {
        try {
          const layoutsSerialized = serializeLayouts(layouts);
          if (layoutsSerialized !== localStorageWrittenRef.current.layouts) {
            window.localStorage.setItem(STORAGE_KEY, layoutsSerialized);
            localStorageWrittenRef.current.layouts = layoutsSerialized;
          }
          const visibleSerialized = JSON.stringify(visible);
          if (visibleSerialized !== localStorageWrittenRef.current.visible) {
            window.localStorage.setItem(STORAGE_VISIBLE_KEY, visibleSerialized);
            localStorageWrittenRef.current.visible = visibleSerialized;
          }
          const locksSerialized = dockLocksCanonicalJson(dockLocks);
          if (locksSerialized !== localStorageWrittenRef.current.locks) {
            window.localStorage.setItem(STORAGE_LOCKED_KEY, locksSerialized);
            localStorageWrittenRef.current.locks = locksSerialized;
          }
        } catch {
          /* quota exceeded / disabled — fall back to in-memory only */
        }
      }, 500);
      return () => window.clearTimeout(handle);
    }, [layouts, visible, dockLocks, projectedLayout]);

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
            | {
                layoutsJson: string;
                visibleJson: string;
                docksLockedJson?: string;
                fillDashboardRowGaps?: boolean;
              }
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
            onFillRowGapsChange(Boolean(layout.fillDashboardRowGaps));
          } catch {
            // ignore malformed DB row
          }
        })
        .catch(() => {})
        .finally(() => setPersistEnabled(true));
    }, [ready, channelTwitchId, onFillRowGapsChange]);

    React.useLayoutEffect(() => {
      if (!persistEnabled || !channelTwitchId || !ready) return;
      if (baselineForChannelRef.current !== channelTwitchId) {
        baselineForChannelRef.current = channelTwitchId;
        lastPersistedLayoutsRef.current = cloneLayouts(layouts);
        lastPersistedVisibleRef.current = [...visible];
        lastPersistedDockLocksRef.current = dockLocksCanonicalJson(dockLocks);
        lastPersistedFillRowGapsRef.current = fillRowGaps;
      }
    }, [persistEnabled, channelTwitchId, ready, layouts, visible, dockLocks, fillRowGaps]);

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
        if (typeof payload.fillDashboardRowGaps === "boolean") {
          lastPersistedFillRowGapsRef.current = payload.fillDashboardRowGaps;
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
        const fillChanged = fillRowGaps !== lastPersistedFillRowGapsRef.current;

        const body: Record<string, unknown> = {};
        // Patch JSON is per-breakpoint and intentionally unwrapped (the server merges into the
        // envelope on read). Full-replacement saves go via `layoutsJson` and use the v2 envelope.
        if (Object.keys(patch).length) body.layoutsPatchJson = JSON.stringify(patch);
        if (visChanged) body.visibleJson = JSON.stringify(visible);
        if (lockChanged) body.docksLockedJson = lockJson;
        if (fillChanged) body.fillDashboardRowGaps = fillRowGaps;

        if (Object.keys(body).length === 0) return;
        void persistToServer(body);
      }, 600);

      return () => window.clearTimeout(t);
    }, [persistEnabled, ready, channelTwitchId, layouts, visible, dockLocks, fillRowGaps, persistToServer]);

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

    /**
     * Add or re-show a dock from the "Add Dock" menu.
     *
     * IMPORTANT: we always WRITE a fresh layout entry with full default size, even when a stale
     * entry exists from a previous session. `hideDock` only flips `visible` off — the layout row
     * stays so resizing-then-toggling round-trips correctly. The downside is that a dock that was
     * shrunk to its minimum (or a row left over from a v1→v3 migration) would otherwise re-open
     * at a tiny size, which is what made docks "EXTREMELY small and i cant see them". Always
     * resetting to `DEFAULT_DOCK_W × meta.h` on menu-add makes the experience predictable.
     *
     * Placement: first free slot that fits `DEFAULT_DOCK_W × meta.h` (scanning top-to-bottom), then
     * `applyIntruderShrink` so neighbours shrink/shift. Explicit `opts.x/y` from drag-drop still wins.
     * After the commit we smooth-scroll to the bottom of the page over two `requestAnimationFrame`
     * ticks so `documentElement.scrollHeight` reflects the grown grid.
     */
    function addDock(key: DockKey, opts?: { x?: number; y?: number; w?: number; h?: number }) {
      setVisible((v) => (v.includes(key) ? v : [...v, key]));
      const meta = DOCK_GRID_METRICS[key];
      const w = Math.max(opts?.w ?? DEFAULT_DOCK_W, meta.minW);
      const h = Math.max(opts?.h ?? meta.h, meta.minH);

      setLayouts((prev) => {
        const base = ((prev.lg ?? []) as Layout[])
          .filter((l) => l.i !== key)
          .map(sanitizeLayoutItem);
        const origin =
          opts?.x != null && opts?.y != null
            ? { x: opts.x, y: opts.y }
            : pickAddDockOrigin(base, w, h, GRID_COLS);
        const intruder: Layout = {
          i: key,
          x: origin.x,
          y: origin.y,
          w,
          h,
          minW: meta.minW,
          minH: meta.minH
        };
        const next = applyIntruderShrink(base, intruder, GRID_COLS, lockedIds);
        const filled = fillRowGaps
          ? expandLayoutFillGaps(packLayoutEdgeToEdge(next, lockedIds), GRID_COLS, lockedIds)
          : next;
        return replicateLayoutToAllBreakpoints(filled);
      });
      setDockMenuOpen(false);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "smooth"
          });
        });
      });
    }

    function hideDock(key: DockKey) {
      setVisible((v) => v.filter((x) => x !== key));
    }

    /**
     * Master dock list for the "Add Dock" panel — every dock is rendered every time, with a
     * solid purple ball when it's currently on the dashboard and an empty purple ring when it
     * isn't. Clicking the row toggles its visibility. The drag affordance is only enabled for
     * hidden docks so the user can still drop them at a specific grid cell.
     */
    const dockMenuItems = React.useMemo(
      () =>
        DOCKS.map((d) => ({
          ...d,
          isVisible: visible.includes(d.key)
        })),
      [visible]
    );

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
     * "Fill dashboard row gaps" toggle → instant snap-to-grid.
     *
     * When the toggle flips from off to on we run `packLayoutEdgeToEdge` against the current
     * layout, replicate the result across breakpoints, and let the existing persist effect
     * push the new layout to the DB. RGL's `compactType="vertical"` keeps vertical packing
     * working continuously while the toggle stays on; horizontal compaction is a one-shot at
     * toggle time because dragging items apart is a legitimate user action we don't want to
     * fight on every gesture.
     *
     * We track the previous toggle value in a ref so the effect only fires on the off→on edge,
     * not on every layout change while the toggle is already on (which would mean fighting the
     * user's drags or recomputing every time `lockedIds` changes).
     */
    const prevFillRowGapsRef = React.useRef<boolean>(fillRowGaps);
    React.useEffect(() => {
      const wasOff = prevFillRowGapsRef.current === false;
      prevFillRowGapsRef.current = fillRowGaps;
      if (!wasOff || !fillRowGaps) return;
      setLayouts((prev) => {
        const lg = ((prev.lg ?? []) as Layout[]).map(sanitizeLayoutItem);
        const packed = packLayoutEdgeToEdge(lg, lockedIds);
        const expanded = expandLayoutFillGaps(packed, GRID_COLS, lockedIds);
        return replicateLayoutToAllBreakpoints(expanded);
      });
    }, [fillRowGaps, lockedIds]);

    /**
     * Shared drag/resize reducer.
     *
     * Computes the projected layout from the pre-drag snapshot + the current intruder position
     * and updates `shrinkingIds` so any dock whose size/position differs from its snapshot gets
     * the purple "this is where I'm going" outline overlay.
     *
     * The `commit` parameter switches between two operating modes:
     *
     *   - `false` (during drag/resize) — split state:
     *       `layouts` is updated to a hybrid layout where only the intruder follows the
     *       cursor; every other dock stays at its pre-drag slot. The resolver's *real* output
     *       (with shrinks/shifts applied) is mirrored into `projectedLayout` and rendered as
     *       absolute-positioned outlines on top. Effect: the user sees the bottom dock fade
     *       in place while a purple ghost outline previews its post-drop shape.
     *
     *   - `true` (on stop) — full commit:
     *       The resolver output is written to `layouts` (so docks animate from their
     *       pre-drag bounds to their new bounds), `projectedLayout` is cleared, and the
     *       shrinking-id set is dropped on a short delay so the new shape is visible briefly
     *       before the highlight fades.
     */
    const applyIntruder = React.useCallback(
      (newItem: Layout, commit: boolean) => {
        const base =
          dragOriginalLayoutRef.current ??
          ((layouts.lg ?? []) as Layout[]).map(sanitizeLayoutItem);
        const intruder = sanitizeLayoutItem(newItem);
        let next = applyIntruderShrink(base, intruder, GRID_COLS, lockedIds);

        if (commit && fillRowGaps) {
          next = expandLayoutFillGaps(packLayoutEdgeToEdge(next, lockedIds), GRID_COLS, lockedIds);
        }

        // Compute which non-intruder docks changed compared to the snapshot — they're the
        // ones the user should see highlighted (faded body).
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

        if (commit) {
          setLayouts(replicateLayoutToAllBreakpoints(next));
          setProjectedLayout(null);
          setShrinkingIds(new Set());
          dragOriginalLayoutRef.current = null;
          return;
        }

        // In-flight: freeze every non-intruder dock at its pre-drag position so the user
        // perceives the dock body as "still here", while the overlay layer below renders the
        // resolver's projected slots.
        const inflight: Layout[] = [];
        let placed = false;
        for (const it of base) {
          if (it.i === intruder.i) {
            inflight.push(intruder);
            placed = true;
          } else {
            inflight.push(it);
          }
        }
        if (!placed) inflight.push(intruder);

        // Drag-tick fast path: skip the full breakpoint replication (5 deep copies × 8 docks ×
        // every frame). Only `lg` actually drives the visible grid during a gesture — the
        // smaller breakpoints will be replicated from the final layout when `applyIntruder`
        // runs with `commit=true` on gesture stop, which is one allocation instead of dozens.
        setLayouts((prev) => ({ ...prev, lg: inflight }));
        setProjectedLayout(next);
      },
      [layouts, lockedIds, fillRowGaps]
    );

    const handleInteractionStart = React.useCallback(() => {
      dragOriginalLayoutRef.current = ((layouts.lg ?? []) as Layout[]).map(sanitizeLayoutItem);
    }, [layouts]);

    /**
     * Move-gesture start/stop wrapper that toggles `body[data-dragging]`.
     *
     * Hiding the placeholder during a move relies on detecting an active gesture as early as
     * possible. We could just CSS-select `body:has(.react-grid-item.react-draggable-dragging)`,
     * but that class arrives one render frame *after* RGL has already mounted its placeholder,
     * so the user briefly sees the placeholder flash before the rule fires. Setting a data
     * attribute on `<body>` synchronously in `onDragStart` closes that window — the CSS rule
     * matches immediately and the placeholder is hidden from the first frame of the gesture.
     */
    const handleDragStart = React.useCallback(() => {
      handleInteractionStart();
      document.body.dataset.dragging = "1";
    }, [handleInteractionStart]);

    const handleDragStop = React.useCallback(
      (_layout: Layout[], _oldItem: Layout, newItem: Layout) => {
        applyIntruder(newItem, true);
        delete document.body.dataset.dragging;
      },
      [applyIntruder]
    );

    /**
     * Pick the resize cursor axis ("x" / "y" / "nesw" / "nwse") from the handle element that
     * react-grid-layout passes to `onResizeStart` as its 6th arg. We compare against the
     * canonical `react-resizable-handle-XX` token list so partial matches (e.g. "handle-n"
     * accidentally matching "handle-ne") can't happen.
     *
     * Returns null when we can't identify the handle, in which case we skip setting the cursor
     * lock — the existing per-handle CSS cursors are still good enough on their own.
     */
    const resolveResizeAxis = React.useCallback((element: unknown): string | null => {
      if (!(element instanceof HTMLElement)) return null;
      const tokens = element.className.split(/\s+/);
      const has = (t: string) => tokens.includes(`react-resizable-handle-${t}`);
      if (has("n") || has("s")) return "y";
      if (has("e") || has("w")) return "x";
      if (has("se") || has("nw")) return "nwse";
      if (has("ne") || has("sw")) return "nesw";
      return null;
    }, []);

    /**
     * Lock the page-wide cursor for the duration of a resize gesture.
     *
     * Without this, the directional resize cursor (e.g. `ew-resize`) only paints while the
     * pointer is literally hovering the 6px handle strip — drag off it and the cursor reverts
     * to whatever sits under the pointer, then snaps back to the directional cursor whenever
     * the pointer happens to cross a handle. Setting `body[data-resize-axis]` lets the CSS in
     * `globals.css` force the directional cursor on every element until we clear it.
     */
    const handleResizeStart = React.useCallback(
      (
        _layout: Layout[],
        _oldItem: Layout,
        _newItem: Layout,
        _placeholder: Layout,
        _e: MouseEvent,
        element: HTMLElement
      ) => {
        handleInteractionStart();
        const axis = resolveResizeAxis(element);
        if (axis) document.body.dataset.resizeAxis = axis;
      },
      [handleInteractionStart, resolveResizeAxis]
    );

    const handleResizeStop = React.useCallback(
      (_layout: Layout[], _oldItem: Layout, newItem: Layout) => {
        applyIntruder(newItem, true);
        delete document.body.dataset.resizeAxis;
      },
      [applyIntruder]
    );

    /**
     * Belt-and-braces cleanup: if the dock unmounts mid-gesture for any reason, drop both the
     * cursor lock and the dragging flag so the rest of the app doesn't get stuck in a
     * resize cursor or rendering a hidden placeholder.
     */
    React.useEffect(() => {
      return () => {
        delete document.body.dataset.resizeAxis;
        delete document.body.dataset.dragging;
      };
    }, []);

    /**
     * Wrapper-div className for the dock identified by `key`.
     *
     * When the resolver has flagged the dock as currently being shrunk/shifted, we tag the
     * wrapper with `sv-dock-shrinking` so `globals.css` fades the dock contents. The actual
     * purple outline preview is drawn by the absolute-positioned overlay layer below (sized
     * from `projectedLayout`) rather than by `::before` on this wrapper — that's why the
     * outline can sit at the dock's *future* slot while the dock body stays where it is.
     */
    const shrinkClass = React.useCallback(
      (key: DockKey) =>
        cn("sv-dock-wrap", shrinkingIds.has(key) && "sv-dock-shrinking"),
      [shrinkingIds]
    );

    /**
     * Translate a grid item's `{x,y,w,h}` into a fully self-contained set of CSS values that
     * the browser will resolve against the wrapper's own width. Mirrors RGL's internal
     * `calcGridItemPosition` math but expressed in `calc(...)` form so we don't need a measured
     * `gridWidth` state at all — even if our resize observer hasn't fired yet, the outline
     * still lines up perfectly with where the actual dock will land on commit.
     *
     * Derivation (matches react-grid-layout's `calcGridItemPosition` exactly, since both
     * `containerPadding` values are 0):
     *   colWidth   = (100% - marginX * (cols - 1)) / cols
     *   left(x)    = x * (colWidth + marginX)
     *   width(w)   = w * colWidth + (w - 1) * marginX
     *   top(y)     = y * (rowHeight + marginY)
     *   height(h)  = h * rowHeight + (h - 1) * marginY
     *
     * Constants below must match the `<ResponsiveGridLayout>` props (margin/rowHeight/cols).
     */
    const projectedOutlines = React.useMemo(() => {
      if (!projectedLayout) return null;
      const baseSnap = dragOriginalLayoutRef.current;
      if (!baseSnap) return null;

      const changed = projectedLayout.filter((pl) => {
        const orig = baseSnap.find((b) => b.i === pl.i);
        return (
          !orig ||
          orig.x !== pl.x ||
          orig.y !== pl.y ||
          orig.w !== pl.w ||
          orig.h !== pl.h
        );
      });
      if (changed.length === 0) return null;

      const marginX = 4;
      const marginY = 8;
      const rowHeight = 15;
      const totalGapPx = marginX * (GRID_COLS - 1);
      const colWidthExpr = `((100% - ${totalGapPx}px) / ${GRID_COLS})`;

      return changed.map((item) => {
        const xGap = item.x * marginX;
        const wGap = Math.max(0, item.w - 1) * marginX;
        const left = `calc(${item.x} * ${colWidthExpr} + ${xGap}px)`;
        const width = `calc(${item.w} * ${colWidthExpr} + ${wGap}px)`;
        const top = item.y * (rowHeight + marginY);
        const height = item.h * rowHeight + Math.max(0, item.h - 1) * marginY;
        return { id: String(item.i), left, top, width, height };
      });
    }, [projectedLayout]);

    const [dockMenuHost, setDockMenuHost] = React.useState<HTMLElement | null>(null);
    React.useLayoutEffect(() => {
      setDockMenuHost(document.getElementById("sv-dashboard-dock-menu-anchor"));
    }, [dockMenuOpen]);

    const dockMenuPanel =
      dockMenuOpen ? (
        <div className="sv-dock-menu-panel pointer-events-auto w-[340px] overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black/70 ring-1 ring-white/10">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="text-sm font-semibold text-white">Add Dock</div>
            <button
              type="button"
              className="text-xs text-white/60 hover:text-white"
              onClick={() => setDockMenuOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="max-h-[min(70vh,520px)] overflow-y-auto p-2">
            <div className="px-3 pb-2 text-xs text-white/80">
              Toggle a dock on or off, or drag a hidden dock into the grid for precise placement.
            </div>
            <div className="space-y-1">
              {dockMenuItems.map((d) => (
                <div
                  key={d.key}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition",
                    "text-white/80 hover:bg-white/[0.05] hover:text-white"
                  )}
                >
                  <div
                    draggable={!d.isVisible}
                    onDragStart={(e) => {
                      if (d.isVisible) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData("application/x-streamcore-dock", d.key);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5",
                      d.isVisible ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                    )}
                    title={d.isVisible ? "On dashboard — toggle off to hide" : "Drag into the grid"}
                  >
                    <span className="truncate font-medium">{d.name}</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={d.isVisible}
                    draggable={false}
                    onClick={() => (d.isVisible ? hideDock(d.key) : addDock(d.key))}
                    className={cn(
                      "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200",
                      d.isVisible
                        ? "border-primary/60 bg-primary/90"
                        : "border-white/20 bg-white/10"
                    )}
                    title={d.isVisible ? "Hide dock" : "Show dock"}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200",
                        d.isVisible ? "left-[18px]" : "left-0.5"
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null;

    return (
      <div className="relative">
        {dockMenuHost && dockMenuPanel ? createPortal(dockMenuPanel, dockMenuHost) : null}
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
           *
           * `allowOverlap` is bound to `!fillRowGaps`: when fill mode is ON the grid is strictly
           * non-overlapping (the user asked for "push, not overlap"), and when it's OFF we let
           * the in-flight drag freely overlap so the fluid resolver can render its split-state
           * preview (intruder follows cursor, neighbours fade in place). The committed layout
           * is overlap-free either way because `applyIntruderShrink` only writes non-overlapping
           * results.
           */}
          <div className="relative">
          <ResponsiveGridLayout
            className="layout"
            layouts={layoutsForGrid}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            // v4 grid: 12 OBS-style columns; 4px horizontal margin matches the fine snap feel.
            cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
            rowHeight={15}
            margin={[4, 8]}
            containerPadding={[0, 0]}
            draggableHandle=".sv-drag-handle"
            draggableCancel="button, input, textarea, select, a, iframe, [role='combobox'], [data-rgl-no-drag]"
            // All 8 handles enabled — sides cover their full edge (see globals.css), corners
            // overlap on top with diagonal cursors for free 2D resize.
            resizeHandles={["s", "n", "w", "e", "sw", "se", "nw", "ne"]}
            isResizable
            isDraggable
            compactType={fillRowGaps ? "vertical" : null}
            preventCollision={false}
            allowOverlap={!fillRowGaps}
            onDragStart={handleDragStart}
            onDrag={(_layout, _oldItem, newItem) => applyIntruder(newItem as Layout, false)}
            onDragStop={handleDragStop}
            onResizeStart={handleResizeStart}
            onResize={(_layout, _oldItem, newItem) => applyIntruder(newItem as Layout, false)}
            onResizeStop={handleResizeStop}
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
                let next = applyIntruderShrink(base, intruder, GRID_COLS, lockedIds);
                if (fillRowGaps) {
                  next = expandLayoutFillGaps(packLayoutEdgeToEdge(next, lockedIds), GRID_COLS, lockedIds);
                }
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
                <ChatDock
                  onClose={() => hideDock("liveChat")}
                  dockLocked={Boolean(dockLocks.liveChat)}
                  onToggleDockLock={() => toggleDockLock("liveChat")}
                />
              </div>
            ) : null}
            {visible.includes("rewardsQueue") ? (
              <div key="rewardsQueue" className={shrinkClass("rewardsQueue")}>
                <RewardsQueueDock
                  onClose={() => hideDock("rewardsQueue")}
                  dockLocked={Boolean(dockLocks.rewardsQueue)}
                  onToggleDockLock={() => toggleDockLock("rewardsQueue")}
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

          {/**
           * Projected-slot preview overlay.
           *
           * Sits on top of the grid (z-30) but is pointer-events:none so it never steals clicks
           * from the docks underneath. Each rectangle is sized from `projectedLayout` — the
           * post-resolver shape every "shrinking" dock will adopt the moment the gesture ends.
           * The dock bodies themselves stay at their pre-drag size (faded via
           * `.sv-dock-shrinking`) so the user can read "outline = future, faded body = present".
           *
           * All visual styles are inline rather than Tailwind classes so they apply even if the
           * arbitrary-value JIT pass misses them on a hot-reload cycle, and so the purple ring
           * always reads as the dominant signal regardless of theme tweaks.
           */}
          {projectedOutlines && projectedOutlines.length > 0 ? (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ zIndex: 30 }}
            >
              {projectedOutlines.map((o) => (
                <div
                  key={`projection-${o.id}`}
                  style={{
                    position: "absolute",
                    left: o.left,
                    top: o.top,
                    width: o.width,
                    height: o.height,
                    borderRadius: 12,
                    border: "2px solid rgba(168, 85, 247, 0.85)",
                    backgroundColor: "rgba(168, 85, 247, 0.10)",
                    boxShadow:
                      "inset 0 0 0 1px rgba(168, 85, 247, 0.35), 0 0 28px rgba(168, 85, 247, 0.30)"
                  }}
                />
              ))}
            </div>
          ) : null}
          </div>

          <div className="mt-4 text-xs text-white/45">
            Tip: Use the dock’s (X) button to close it. Re-add it from “Add Dock”.
          </div>
        </div>
      </div>
    );
  }
);
