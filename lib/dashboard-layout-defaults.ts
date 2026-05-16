import type { Layout, Layouts } from "react-grid-layout";

export type DashboardDockKey =
  | "streamPreview"
  | "liveChat"
  | "activityFeed"
  | "quickActions"
  | "quickClip"
  | "spotifyBridge"
  | "soundMixer"
  | "streamInfo";

/** Horizontal columns for the live dashboard (OBS-style 12-wide grid). */
export const DASHBOARD_GRID_COLS = 12 as const;

/**
 * Grid resolution version.
 *
 * v1 = 16 cols,  rowHeight 30, margin 14   (initial layout)
 * v2 = 32 cols,  rowHeight 15, margin 8    (2× horizontal density)
 * v3 = 128 cols, rowHeight 15, margin [4, 8] (4× horizontal density)
 * v4 = 12 cols,  rowHeight 15, margin [4, 8] (OBS-style twelve-column grid; migrated from v3)
 *
 * `DashboardGrid` reads layouts saved by older clients as v1/v2 and rescales them via
 * `migrateLayoutsV1ToV2` / `migrateLayoutsV2ToV3` / `migrateLayoutsV3ToV4` before handing them to
 * `ResponsiveGridLayout`. New writes use `{ __v: 4, layouts }` (see `serializeLayouts`).
 */
export const DASHBOARD_LAYOUT_VERSION = 4 as const;

/**
 * Grid row heights use DashboardGrid `rowHeight` + vertical `margin` (see app).
 * These min/default `h` and `minW` values are tuned for the v4 grid (12 cols × 15px rowHeight).
 */
export const DOCK_GRID_METRICS: Record<
  DashboardDockKey,
  { minH: number; h: number; minW: number }
> = {
  streamPreview: { minH: 14, h: 14, minW: 3 },
  liveChat: { minH: 12, h: 12, minW: 3 },
  activityFeed: { minH: 12, h: 12, minW: 2 },
  quickActions: { minH: 12, h: 12, minW: 3 },
  quickClip: { minH: 8, h: 8, minW: 2 },
  spotifyBridge: { minH: 16, h: 18, minW: 3 },
  soundMixer: { minH: 9, h: 22, minW: 2 },
  streamInfo: { minH: 22, h: 22, minW: 3 }
};

export const DASHBOARD_DEFAULT_VISIBLE: DashboardDockKey[] = [
  "streamPreview",
  "liveChat",
  "activityFeed",
  "quickActions"
];

/** Per-dock lock: only `true` entries are stored / sent (unlocked = absent). */
export type DockLocksState = Partial<Record<DashboardDockKey, boolean>>;

const DOCK_KEY_SET = new Set<string>([
  "streamPreview",
  "liveChat",
  "activityFeed",
  "quickActions",
  "quickClip",
  "spotifyBridge",
  "soundMixer",
  "streamInfo"
]);

export function isDashboardDockKey(k: string): k is DashboardDockKey {
  return DOCK_KEY_SET.has(k);
}

/** Drop removed / unknown dock keys from persisted `visible` arrays. */
export function sanitizeVisibleDockKeys(keys: string[]): DashboardDockKey[] {
  return keys.filter((k): k is DashboardDockKey => DOCK_KEY_SET.has(k));
}

export function parseDockLocksJson(raw: string | null | undefined): DockLocksState {
  if (!raw?.trim()) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object") return {};
    const out: DockLocksState = {};
    for (const [k, v] of Object.entries(o)) {
      if (DOCK_KEY_SET.has(k) && v === true) {
        out[k as DashboardDockKey] = true;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Canonical string for comparing persisted dock lock state. */
export function dockLocksCanonicalJson(locks: DockLocksState): string {
  const keys = Object.keys(locks).filter((k) => DOCK_KEY_SET.has(k) && locks[k as DashboardDockKey]) as string[];
  keys.sort();
  const o: Record<string, boolean> = {};
  for (const k of keys) o[k] = true;
  return JSON.stringify(o);
}

function m(key: DashboardDockKey) {
  return DOCK_GRID_METRICS[key];
}

/**
 * Merge catalog min sizes into a layout item and clamp `h` / `w` so they're never below the
 * floor.
 *
 * The catalog is authoritative: we overwrite any stored `minH`/`minW` with the current catalog
 * values rather than taking the max. Otherwise *lowering* a min in `DOCK_GRID_METRICS` would not
 * propagate to already-persisted rows (Math.max would keep the older, higher value), which made
 * it impossible to shrink a dock further after a code change relaxed its limits.
 *
 * Sizes are clamped both ways: `h` is bumped up to `minH` when too small, and we no longer
 * touch `w` at all (the grid clamps `w` against `minW` on its own at render time, and users can
 * legitimately set widths smaller than a stale minW from a previous app version).
 */
export function normalizeDashboardLayoutItem(item: Layout): Layout {
  const id = String(item.i);
  if (!DOCK_KEY_SET.has(id)) return item;
  const meta = DOCK_GRID_METRICS[id as DashboardDockKey];
  const minH = meta.minH;
  const minW = meta.minW;
  const h = Math.max(item.h, minH);
  const next: Layout = { ...item, minH, minW, h };
  if (id === "liveChat") {
    next.resizeHandles = ["s", "n", "w", "e", "sw", "se", "nw", "ne"];
  }
  return next;
}

const LAYOUT_BP_KEYS: (keyof Layouts)[] = ["lg", "md", "sm", "xs", "xxs"];

/** Apply per-dock minimum width/height floors (e.g. after loading saved layouts). */
export function normalizeDashboardLayouts(layouts: Layouts): Layouts {
  const out = {} as Layouts;
  for (const bp of LAYOUT_BP_KEYS) {
    const arr = layouts[bp] as Layout[] | undefined;
    out[bp] = (arr ?? [])
      .filter((it) => DOCK_KEY_SET.has(String(it.i)))
      .map(normalizeDashboardLayoutItem) as Layout[];
  }
  return out;
}

/**
 * Copies one canonical layout to every breakpoint so ResponsiveGridLayout never swaps to a
 * different x/y when the container width changes (e.g. sidebar toggle). Use with `cols` 32 at
 * all breakpoints.
 */
export function replicateLayoutToAllBreakpoints(layout: Layout[]): Layouts {
  const cleaned = layout
    .filter((it) => DOCK_KEY_SET.has(String(it.i)))
    .map(normalizeDashboardLayoutItem) as Layout[];
  const out = {} as Layouts;
  for (const bp of LAYOUT_BP_KEYS) {
    out[bp] = cleaned.map((item) => ({ ...item }));
  }
  return out;
}

export function defaultDashboardLayouts(): Layouts {
  const lg: Layout[] = [
    { i: "streamPreview", x: 0, y: 0, w: 6, ...m("streamPreview") },
    { i: "liveChat", x: 6, y: 0, w: 6, ...m("liveChat") },
    { i: "activityFeed", x: 0, y: 14, w: 4, ...m("activityFeed") },
    { i: "quickActions", x: 4, y: 14, w: 8, ...m("quickActions") }
  ];
  return replicateLayoutToAllBreakpoints(lg);
}

/**
 * Per-axis scaler used to migrate older grid versions. Vertical scaling is independent because
 * v3 deliberately keeps rowHeight unchanged from v2 to avoid shrinking dock heights.
 */
function scaleLayoutItem(item: Layout, xScale: number, yScale: number): Layout {
  const next: Layout = {
    ...item,
    x: Math.round((item.x ?? 0) * xScale),
    y: Math.round((item.y ?? 0) * yScale),
    w: Math.max(1, Math.round((item.w ?? 1) * xScale)),
    h: Math.max(1, Math.round((item.h ?? 1) * yScale))
  };
  if (item.minW != null) next.minW = Math.round(item.minW * xScale);
  if (item.minH != null) next.minH = Math.round(item.minH * yScale);
  if (item.maxW != null) next.maxW = Math.round(item.maxW * xScale);
  if (item.maxH != null) next.maxH = Math.round(item.maxH * yScale);
  return next;
}

function scaleLayouts(layouts: Layouts, xScale: number, yScale: number): Layouts {
  const out = {} as Layouts;
  for (const bp of LAYOUT_BP_KEYS) {
    out[bp] = ((layouts[bp] ?? []) as Layout[]).map((it) => scaleLayoutItem(it, xScale, yScale));
  }
  return out;
}

/**
 * v1 → v2: 16 → 32 cols (×2 horizontal), 30 → 15px rowHeight (×2 vertical).
 * Visual size is preserved because both step sizes halve and both grid counts double.
 */
export function migrateLayoutsV1ToV2(layouts: Layouts): Layouts {
  return scaleLayouts(layouts, 2, 2);
}

/**
 * v2 → v3: 32 → 128 cols (×4 horizontal), rowHeight unchanged (×1 vertical).
 * Horizontal positions / widths quadruple; vertical stays the same.
 */
export function migrateLayoutsV2ToV3(layouts: Layouts): Layouts {
  return scaleLayouts(layouts, 4, 1);
}

const V3_COLS = 128;
const V4_COLS = DASHBOARD_GRID_COLS;

/**
 * v3 → v4: 128 → 12 columns. Vertical grid rows are unchanged (same rowHeight).
 */
export function migrateLayoutsV3ToV4(layouts: Layouts): Layouts {
  const out = {} as Layouts;
  for (const bp of LAYOUT_BP_KEYS) {
    out[bp] = ((layouts[bp] ?? []) as Layout[]).map((item) => {
      const x = Math.round(((item.x ?? 0) * V4_COLS) / V3_COLS);
      let w = Math.max(1, Math.round(((item.w ?? 1) * V4_COLS) / V3_COLS));
      const xClamped = Math.min(x, Math.max(0, V4_COLS - w));
      if (xClamped + w > V4_COLS) w = V4_COLS - xClamped;
      return {
        ...item,
        x: xClamped,
        w: Math.max(1, w),
        minW: item.minW != null ? Math.max(1, Math.round((item.minW * V4_COLS) / V3_COLS)) : item.minW
      } as Layout;
    }) as Layout[];
  }
  return out;
}

/** Serialised envelope persisted to localStorage + the dashboard layout DB row. */
type StoredLayoutsEnvelope = { __v: number; layouts: Layouts };

function isStoredEnvelope(raw: unknown): raw is StoredLayoutsEnvelope {
  return (
    !!raw &&
    typeof raw === "object" &&
    typeof (raw as { __v?: unknown }).__v === "number" &&
    typeof (raw as { layouts?: unknown }).layouts === "object"
  );
}

/**
 * Apply every pending migration to land at the current version.
 *
 * Each step is independent (`vN → vN+1`) so adding a v3 → v4 migration in the future is a
 * single new function + one extra `if` branch here, with no risk of double-applying old steps.
 */
function migrateLayoutsToLatest(layouts: Layouts, fromVersion: number): Layouts {
  let current = layouts;
  let version = fromVersion;
  if (version < 2) {
    current = migrateLayoutsV1ToV2(current);
    version = 2;
  }
  if (version < 3) {
    current = migrateLayoutsV2ToV3(current);
    version = 3;
  }
  if (version < 4) {
    current = migrateLayoutsV3ToV4(current);
    version = 4;
  }
  return current;
}

/**
 * Parse a persisted layouts blob. Handles three shapes:
 *
 *   1. Empty / non-JSON → `null` (caller falls back to defaults).
 *   2. Raw `Layouts` (no envelope) → treated as v1, migrated through every step to latest.
 *   3. Versioned envelope `{ __v, layouts }` → migrated from the stored version to latest.
 *
 * The migration is one-way: once we save back with `serializeLayouts`, the blob is replaced with
 * a `{ __v: <current>, layouts }` envelope so subsequent loads short-circuit at step 3.
 */
export function parseStoredLayouts(raw: string | null | undefined): Layouts | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (isStoredEnvelope(parsed)) {
    if (parsed.__v >= DASHBOARD_LAYOUT_VERSION) return parsed.layouts;
    return migrateLayoutsToLatest(parsed.layouts, parsed.__v);
  }
  // Legacy unversioned blob = raw v1 Layouts.
  return migrateLayoutsToLatest(parsed as Layouts, 1);
}

export function serializeLayouts(layouts: Layouts): string {
  return JSON.stringify({ __v: DASHBOARD_LAYOUT_VERSION, layouts } satisfies StoredLayoutsEnvelope);
}
