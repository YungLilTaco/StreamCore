/**
 * Unified Twitch-style activity kinds (filter + API contract).
 * Many kinds are only filled when EventSub/bridge exists; Helix fills a subset today.
 */
export const ACTIVITY_FEED_KIND_KEYS = [
  "follow",
  "sub",
  "gift_sub",
  "cheer",
  "channel_points_redeem",
  "boost",
  "collaboration_request",
  "goal",
  "hype_train",
  "poll",
  "prediction",
  "raid",
  "shoutout",
  "watch_streak"
] as const;

export type ActivityFeedEventKind = (typeof ACTIVITY_FEED_KIND_KEYS)[number];

export type ActivityFeedItemDTO = {
  id: string;
  kind: ActivityFeedEventKind;
  text: string;
  /** Epoch ms; 0 = unknown time (e.g. subscription snapshot rows). */
  ts: number;
  /**
   * Lowercase Twitch login of the user who triggered the event (the follower, subscriber, cheerer,
   * gifter, raider, etc.). Optional because not every kind has a clear single "actor" — polls and
   * predictions, for example, don't.
   */
  actorLogin?: string;
  /** Twitch numeric user id for `actorLogin` when we know it. */
  actorTwitchId?: string;
  /** Display name with original casing — preferred over `actorLogin` when rendering the click target. */
  actorDisplayName?: string;
  /**
   * Optional secondary user (recipient on a gift sub, target on a raid). When present, the UI may
   * render two clickable names: actor and target.
   */
  targetLogin?: string;
  targetTwitchId?: string;
  targetDisplayName?: string;
};

export const ACTIVITY_FEED_KIND_LABELS: Record<ActivityFeedEventKind, string> = {
  follow: "Follows",
  sub: "Subs",
  gift_sub: "Gifted subs",
  cheer: "Cheers",
  channel_points_redeem: "Channel point redeems",
  boost: "Boosts",
  collaboration_request: "Collaboration requests",
  goal: "Goals",
  hype_train: "Hype trains",
  poll: "Polls",
  prediction: "Predictions",
  raid: "Raids",
  shoutout: "Shoutouts",
  watch_streak: "Watchstreaks"
};

export const ACTIVITY_FEED_FILTER_STORAGE_KEY = "sv_activity_feed_filters_v2";
export const ACTIVITY_FEED_WINDOW_STORAGE_KEY = "sv_activity_feed_window_days_v1";

/** Allowed lookback windows (days). Anything outside this list reverts to the default. */
export const ACTIVITY_FEED_WINDOW_OPTIONS = [7, 30, 90, 180, 365] as const;
export type ActivityFeedWindowDays = (typeof ACTIVITY_FEED_WINDOW_OPTIONS)[number];

/**
 * Default time window when a user opens the activity feed for the first time (or after clearing
 * their preferences). 90 days strikes a good balance:
 *   - long enough to surface the streamer's last few months of activity even after time off,
 *   - short enough that the initial Helix paginated reads don't fetch hundreds of thousands of
 *     follow rows on big channels.
 *
 * `hasActiveFilterPreset` in `ActivityFeedDock` uses *equality* with this constant to decide
 * whether to highlight the filter button — if the user is sitting on the default they get no
 * highlight, which signals "you're in the out-of-the-box state".
 */
export const ACTIVITY_FEED_WINDOW_DEFAULT: ActivityFeedWindowDays = 90;

export const ACTIVITY_FEED_WINDOW_LABELS: Record<ActivityFeedWindowDays, string> = {
  7: "Last week",
  30: "Last month",
  90: "Last 3 months",
  180: "Last 6 months",
  365: "Last year"
};

export function coerceActivityFeedWindowDays(input: unknown): ActivityFeedWindowDays {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return ACTIVITY_FEED_WINDOW_DEFAULT;
  return (ACTIVITY_FEED_WINDOW_OPTIONS as readonly number[]).includes(n)
    ? (n as ActivityFeedWindowDays)
    : ACTIVITY_FEED_WINDOW_DEFAULT;
}

/** Legacy API / older clients → unified kinds */
const LEGACY_KIND_MAP: Record<string, ActivityFeedEventKind> = {
  points: "channel_points_redeem",
  gift: "gift_sub"
};

export function coerceActivityFeedKind(raw: string): ActivityFeedEventKind | null {
  if (ACTIVITY_FEED_KIND_KEYS.includes(raw as ActivityFeedEventKind)) return raw as ActivityFeedEventKind;
  return LEGACY_KIND_MAP[raw] ?? null;
}

export function defaultActivityFeedFilters(): Record<ActivityFeedEventKind, boolean> {
  return Object.fromEntries(ACTIVITY_FEED_KIND_KEYS.map((k) => [k, true])) as Record<
    ActivityFeedEventKind,
    boolean
  >;
}

export function parseActivityFeedFilters(raw: string | null): Record<ActivityFeedEventKind, boolean> | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object") return null;
    const base = defaultActivityFeedFilters();
    for (const k of ACTIVITY_FEED_KIND_KEYS) {
      if (typeof o[k] === "boolean") base[k] = o[k];
    }
    const enabled = ACTIVITY_FEED_KIND_KEYS.filter((k) => base[k]).length;
    if (enabled === 0) return null;
    return base;
  } catch {
    return null;
  }
}

/**
 * Strictly-monotonic relative timestamp formatter — each successive bucket represents *more* time
 * than the previous. Avoids ugly transitions like `7w → 1mo` (which visually looks like less time
 * even though it's not). Bucket boundaries:
 *   < 10s     just now
 *   < 60s     Ns ago
 *   < 60m     Nm ago
 *   < 24h     Nh ago
 *   < 7d      Nd ago
 *   < 30d     Nw ago   (1..4 only)
 *   < 12mo    Nmo ago  (1..11)
 *   else      Ny ago
 */
export function formatActivityTimeAgo(tsMs: number, nowMs: number): string {
  if (!tsMs || tsMs <= 0) return "—";
  const sec = Math.max(0, Math.floor((nowMs - tsMs) / 1000));
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}
