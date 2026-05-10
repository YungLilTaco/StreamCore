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

/**
 * Grid row heights use DashboardGrid `rowHeight` + vertical `margin` (see app).
 * These min/default `h` values are tuned so each dock’s typical UI fits without clipping.
 */
export const DOCK_GRID_METRICS: Record<
  DashboardDockKey,
  { minH: number; h: number; minW: number }
> = {
  streamPreview: { minH: 7, h: 7, minW: 4 },
  liveChat: { minH: 6, h: 6, minW: 4 },
  activityFeed: { minH: 6, h: 6, minW: 3 },
  quickActions: { minH: 6, h: 6, minW: 4 },
  quickClip: { minH: 4, h: 4, minW: 3 },
  spotifyBridge: { minH: 7, h: 7, minW: 4 },
  soundMixer: { minH: 8, h: 8, minW: 4 },
  streamInfo: { minH: 11, h: 11, minW: 4 }
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

/** Merge catalog min sizes into a layout item and ensure `h` is at least `minH`. */
export function normalizeDashboardLayoutItem(item: Layout): Layout {
  const id = String(item.i);
  if (!DOCK_KEY_SET.has(id)) return item;
  const meta = DOCK_GRID_METRICS[id as DashboardDockKey];
  const minH = Math.max(item.minH ?? 0, meta.minH);
  const minW = Math.max(item.minW ?? 0, meta.minW);
  const h = Math.max(item.h, minH);
  return { ...item, minH, minW, h };
}

const LAYOUT_BP_KEYS: (keyof Layouts)[] = ["lg", "md", "sm", "xs", "xxs"];

/** Apply per-dock minimum width/height floors (e.g. after loading saved layouts). */
export function normalizeDashboardLayouts(layouts: Layouts): Layouts {
  const out = {} as Layouts;
  for (const bp of LAYOUT_BP_KEYS) {
    const arr = layouts[bp] as Layout[] | undefined;
    out[bp] = (arr ?? []).map(normalizeDashboardLayoutItem) as Layout[];
  }
  return out;
}

export function defaultDashboardLayouts(): Layouts {
  const lg: Layout[] = [
    { i: "streamPreview", x: 0, y: 0, w: 6, ...m("streamPreview") },
    { i: "liveChat", x: 6, y: 0, w: 6, ...m("liveChat") },
    { i: "activityFeed", x: 12, y: 0, w: 4, ...m("activityFeed") },
    { i: "quickActions", x: 0, y: 7, w: 8, ...m("quickActions") }
  ];
  const md: Layout[] = [
    { i: "streamPreview", x: 0, y: 0, w: 6, ...m("streamPreview") },
    { i: "liveChat", x: 6, y: 0, w: 6, ...m("liveChat") },
    { i: "activityFeed", x: 0, y: 7, w: 6, ...m("activityFeed") },
    { i: "quickActions", x: 6, y: 7, w: 6, ...m("quickActions") }
  ];
  const sm: Layout[] = [
    { i: "streamPreview", x: 0, y: 0, w: 6, ...m("streamPreview") },
    { i: "liveChat", x: 0, y: 7, w: 6, ...m("liveChat") },
    { i: "activityFeed", x: 0, y: 13, w: 6, ...m("activityFeed") },
    { i: "quickActions", x: 0, y: 19, w: 6, ...m("quickActions") }
  ];

  return { lg, md, sm, xs: sm, xxs: sm };
}
