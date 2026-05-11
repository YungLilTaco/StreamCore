"use client";

import * as React from "react";
import { AnimatePresence, motion } from "@/components/motion/motion";
import {
  Award,
  BarChart2,
  Clock,
  Flame,
  Gift,
  Info,
  ListFilter,
  Megaphone,
  Sparkles,
  Swords,
  Star,
  Target,
  Trophy,
  UserPlus,
  Users,
  Zap
} from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { useTwitchEventSub, type EventSubStatus } from "@/components/dashboard/docks/useTwitchEventSub";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import { cn } from "@/components/lib/cn";
import { Button } from "@/components/ui/button";
import { UserProfilePopover } from "@/components/dashboard/UserProfilePopover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  ACTIVITY_FEED_FILTER_STORAGE_KEY,
  ACTIVITY_FEED_KIND_KEYS,
  ACTIVITY_FEED_KIND_LABELS,
  ACTIVITY_FEED_WINDOW_DEFAULT,
  ACTIVITY_FEED_WINDOW_LABELS,
  ACTIVITY_FEED_WINDOW_OPTIONS,
  ACTIVITY_FEED_WINDOW_STORAGE_KEY,
  coerceActivityFeedKind,
  coerceActivityFeedWindowDays,
  type ActivityFeedEventKind,
  type ActivityFeedItemDTO,
  type ActivityFeedWindowDays,
  defaultActivityFeedFilters,
  formatActivityTimeAgo,
  parseActivityFeedFilters
} from "@/lib/twitch-activity-feed-model";

function readFiltersFromStorage(): Record<ActivityFeedEventKind, boolean> {
  if (typeof window === "undefined") return defaultActivityFeedFilters();
  try {
    return parseActivityFeedFilters(localStorage.getItem(ACTIVITY_FEED_FILTER_STORAGE_KEY)) ?? defaultActivityFeedFilters();
  } catch {
    return defaultActivityFeedFilters();
  }
}

function readWindowFromStorage(): ActivityFeedWindowDays {
  if (typeof window === "undefined") return ACTIVITY_FEED_WINDOW_DEFAULT;
  try {
    return coerceActivityFeedWindowDays(localStorage.getItem(ACTIVITY_FEED_WINDOW_STORAGE_KEY));
  } catch {
    return ACTIVITY_FEED_WINDOW_DEFAULT;
  }
}

function EventSubStatusPill({ status }: { status: EventSubStatus }) {
  let label: string;
  let tone: "live" | "neutral" | "error";
  switch (status.phase) {
    case "live":
      label = `Live${status.succeeded > 0 ? ` · ${status.succeeded}` : ""}`;
      tone = "live";
      break;
    case "connecting":
      label = "Connecting…";
      tone = "neutral";
      break;
    case "subscribing":
      label = "Subscribing…";
      tone = "neutral";
      break;
    case "disconnected":
      label = "Reconnecting…";
      tone = "neutral";
      break;
    case "error":
      label = "Live offline";
      tone = "error";
      break;
    case "idle":
    default:
      return null;
  }
  return (
    <span
      title={status.phase === "error" ? status.message : `EventSub WebSocket: ${status.phase}`}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold uppercase tracking-wide",
        tone === "live" && "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
        tone === "neutral" && "border-white/10 bg-white/5 text-white/65",
        tone === "error" && "border-rose-400/30 bg-rose-500/10 text-rose-200"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "live" && "animate-pulse bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
          tone === "neutral" && "bg-white/40",
          tone === "error" && "bg-rose-400"
        )}
      />
      {label}
    </span>
  );
}

/**
 * Wrap one or two display names inside a row's text with `UserProfilePopover` triggers. We replace
 * by *first occurrence* of each display name (not a regex split) so the surrounding punctuation is
 * preserved verbatim. If actor/target metadata is missing, the row text is rendered as-is.
 */
function ActivityRowText({ row }: { row: ActivityFeedItemDTO }) {
  const actor = row.actorDisplayName && row.actorLogin
    ? { display: row.actorDisplayName, login: row.actorLogin, twitchId: row.actorTwitchId }
    : null;
  const target = row.targetDisplayName && row.targetLogin
    ? { display: row.targetDisplayName, login: row.targetLogin, twitchId: row.targetTwitchId }
    : null;

  if (!actor && !target) return <>{row.text}</>;

  // Build a segments list, replacing the first occurrence of each name with a marker we'll later
  // swap for a popover element. We do this in two passes so each name's slot is independent and
  // we never split inside the other name (which would mangle e.g. "Bob gifted ... to Bobby").
  type Segment = { kind: "text"; value: string } | { kind: "actor" } | { kind: "target" };
  let segments: Segment[] = [{ kind: "text", value: row.text }];

  const replaceFirst = (slot: "actor" | "target", needle: string): void => {
    if (!needle) return;
    const next: Segment[] = [];
    let replaced = false;
    for (const seg of segments) {
      if (replaced || seg.kind !== "text") {
        next.push(seg);
        continue;
      }
      const idx = seg.value.indexOf(needle);
      if (idx < 0) {
        next.push(seg);
        continue;
      }
      const before = seg.value.slice(0, idx);
      const after = seg.value.slice(idx + needle.length);
      if (before) next.push({ kind: "text", value: before });
      next.push({ kind: slot });
      if (after) next.push({ kind: "text", value: after });
      replaced = true;
    }
    segments = next;
  };

  if (actor) replaceFirst("actor", actor.display);
  if (target) replaceFirst("target", target.display);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "text") return <React.Fragment key={i}>{seg.value}</React.Fragment>;
        const slot = seg.kind === "actor" ? actor : target;
        if (!slot) return null;
        return (
          <UserProfilePopover
            key={i}
            login={slot.login}
            userTwitchId={slot.twitchId}
            displayName={slot.display}
          >
            <button
              type="button"
              className="m-0 cursor-pointer rounded border-0 bg-transparent p-0 font-semibold text-cyan-200 underline decoration-transparent transition hover:decoration-current focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
            >
              {slot.display}
            </button>
          </UserProfilePopover>
        );
      })}
    </>
  );
}

function KindIcon({ kind }: { kind: ActivityFeedEventKind }) {
  const className = "h-4 w-4 shrink-0 text-cyan-300/90";
  switch (kind) {
    case "follow":
      return <UserPlus className={className} />;
    case "sub":
      return <Star className={className} />;
    case "gift_sub":
      return <Gift className={className} />;
    case "cheer":
      return <Sparkles className={className} />;
    case "channel_points_redeem":
      return <Award className={className} />;
    case "boost":
      return <Zap className={className} />;
    case "collaboration_request":
      return <Users className={className} />;
    case "goal":
      return <Target className={className} />;
    case "hype_train":
      return <Flame className={className} />;
    case "poll":
      return <BarChart2 className={className} />;
    case "prediction":
      return <Trophy className={className} />;
    case "raid":
      return <Swords className={className} />;
    case "shoutout":
      return <Megaphone className={className} />;
    case "watch_streak":
      return <Clock className={className} />;
    default:
      return <Info className="h-4 w-4 shrink-0 text-white/45" />;
  }
}

export function ActivityFeedDock({
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
  const { channels, channelTwitchId, ready } = useSelectedChannel();
  const isSelfChannel = React.useMemo(
    () => !!channels.find((c) => c.channelTwitchId === channelTwitchId)?.isSelf,
    [channels, channelTwitchId]
  );
  const [allItems, setAllItems] = React.useState<ActivityFeedItemDTO[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<Record<ActivityFeedEventKind, boolean>>(defaultActivityFeedFilters);
  const [windowDays, setWindowDays] = React.useState<ActivityFeedWindowDays>(ACTIVITY_FEED_WINDOW_DEFAULT);
  const [filterMenuOpen, setFilterMenuOpen] = React.useState(false);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  // EventSub WS: real-time durable events for own channel only (Twitch token must == broadcaster).
  const { status: eventSubStatus, liveEvents } = useTwitchEventSub({
    enabled: ready && isSelfChannel,
    channelTwitchId
  });

  React.useLayoutEffect(() => {
    setFilters(readFiltersFromStorage());
    setWindowDays(readWindowFromStorage());
  }, []);

  const persistFilters = React.useCallback((next: Record<ActivityFeedEventKind, boolean>) => {
    try {
      localStorage.setItem(ACTIVITY_FEED_FILTER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const persistWindow = React.useCallback((next: ActivityFeedWindowDays) => {
    try {
      localStorage.setItem(ACTIVITY_FEED_WINDOW_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    setNowMs(Date.now());
  }, [allItems, liveEvents]);

  const load = React.useCallback(() => {
    if (!ready || !channelTwitchId) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      channelTwitchId,
      windowDays: String(windowDays)
    });
    fetch(`/api/twitch/activity-feed?${qs}`, {
      cache: "no-store"
    })
      .then(async (r) => {
        const text = await r.text();
        const json = text ? JSON.parse(text) : null;
        if (!r.ok) throw new Error(json?.message ?? text ?? `Request failed (${r.status})`);
        return json as { items?: ActivityFeedItemDTO[]; warnings?: string[] };
      })
      .then((json) => {
        const raw = Array.isArray(json.items) ? json.items : [];
        const optionalStr = (row: Record<string, unknown>, k: string): string | undefined =>
          typeof row[k] === "string" ? (row[k] as string) : undefined;
        const normalized: ActivityFeedItemDTO[] = [];
        for (const row of raw) {
          if (!row || typeof row.id !== "string" || typeof row.kind !== "string") continue;
          const kind = coerceActivityFeedKind(row.kind);
          if (!kind) continue;
          const r = row as unknown as Record<string, unknown>;
          normalized.push({
            id: row.id,
            kind,
            text: String(row.text ?? ""),
            ts: typeof row.ts === "number" ? row.ts : Number(row.ts) || 0,
            actorLogin: optionalStr(r, "actorLogin"),
            actorTwitchId: optionalStr(r, "actorTwitchId"),
            actorDisplayName: optionalStr(r, "actorDisplayName"),
            targetLogin: optionalStr(r, "targetLogin"),
            targetTwitchId: optionalStr(r, "targetTwitchId"),
            targetDisplayName: optionalStr(r, "targetDisplayName")
          });
        }
        normalized.sort((a, b) => b.ts - a.ts || String(a.id).localeCompare(String(b.id)));
        setAllItems(normalized);
        setWarnings(Array.isArray(json.warnings) ? json.warnings : []);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [ready, channelTwitchId, windowDays]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!ready || !channelTwitchId) return;
    const t = window.setInterval(load, 25_000);
    return () => window.clearInterval(t);
  }, [ready, channelTwitchId, load]);

  /**
   * Merge live EventSub rows on top of the Helix snapshot. We dedupe by `id` first, then strip any
   * snapshot row that the same kind+text+ts (within 5s) is already represented in `liveEvents` —
   * this prevents a follow that came over EventSub from showing again after the next snapshot poll.
   */
  const mergedItems = React.useMemo(() => {
    if (liveEvents.length === 0) return allItems;
    const seenIds = new Set(liveEvents.map((e) => e.id));
    const liveBuckets = new Map<string, number[]>();
    for (const e of liveEvents) {
      const key = `${e.kind}|${e.text}`;
      const arr = liveBuckets.get(key);
      if (arr) arr.push(e.ts);
      else liveBuckets.set(key, [e.ts]);
    }
    const isNearLive = (kind: ActivityFeedEventKind, text: string, ts: number) => {
      const arr = liveBuckets.get(`${kind}|${text}`);
      if (!arr) return false;
      for (const t of arr) {
        if (Math.abs(t - ts) <= 5000) return true;
      }
      return false;
    };
    const merged: ActivityFeedItemDTO[] = [...liveEvents];
    for (const row of allItems) {
      if (seenIds.has(row.id)) continue;
      if (isNearLive(row.kind, row.text, row.ts)) continue;
      merged.push(row);
    }
    merged.sort((a, b) => b.ts - a.ts || String(a.id).localeCompare(String(b.id)));
    return merged;
  }, [allItems, liveEvents]);

  const filteredItems = React.useMemo(
    () => mergedItems.filter((row) => (filters[row.kind] ?? true) !== false),
    [mergedItems, filters]
  );

  const hasActiveFilterPreset = React.useMemo(
    () =>
      ACTIVITY_FEED_KIND_KEYS.some((k) => filters[k] === false) ||
      windowDays !== ACTIVITY_FEED_WINDOW_DEFAULT,
    [filters, windowDays]
  );

  const liveStatusPill = isSelfChannel ? <EventSubStatusPill status={eventSubStatus} /> : null;

  const filterControl = (
    <DropdownMenu open={filterMenuOpen} onOpenChange={setFilterMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-8 w-8 shrink-0 border border-transparent p-0 text-white/70 transition hover:bg-white/[0.06] hover:text-white",
            (filterMenuOpen || hasActiveFilterPreset) &&
              "border-emerald-400/35 text-cyan-200 shadow-[0_0_16px_rgba(52,211,153,0.18)]"
          )}
          aria-label="Filter activity types"
          title="Filter"
        >
          <ListFilter className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[min(75vh,520px)] w-[min(100vw-2rem,280px)] overflow-y-auto">
        <DropdownMenuLabel className="text-emerald-200/90">Time window</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(windowDays)}
          onValueChange={(v) => {
            const next = coerceActivityFeedWindowDays(v);
            setWindowDays(next);
            persistWindow(next);
          }}
        >
          {ACTIVITY_FEED_WINDOW_OPTIONS.map((days) => (
            <DropdownMenuRadioItem key={days} value={String(days)} onSelect={(e) => e.preventDefault()}>
              {ACTIVITY_FEED_WINDOW_LABELS[days]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-emerald-200/90">Event types</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACTIVITY_FEED_KIND_KEYS.map((kind) => (
          <DropdownMenuCheckboxItem
            key={kind}
            checked={filters[kind]}
            onCheckedChange={(v) => {
              setFilters((prev) => {
                const next = { ...prev, [kind]: v === true };
                persistFilters(next);
                return next;
              });
            }}
            onSelect={(e) => e.preventDefault()}
          >
            {ACTIVITY_FEED_KIND_LABELS[kind]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <DockShell
      title="Activity Feed"
      right={
        <div className="flex items-center gap-1.5">
          {liveStatusPill}
          {filterControl}
        </div>
      }
      dragHandleProps={dragHandleProps}
      onClose={onClose}
      dockLocked={dockLocked}
      onToggleDockLock={onToggleDockLock}
    >
      <div className="flex h-full min-h-0 w-full flex-col gap-2">
        {!ready || !channelTwitchId ? (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/60">
            {!ready ? "Resolving channel…" : "Select a Twitch channel from the profile menu."}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-100">{error}</div>
        ) : null}
        {warnings.length ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-100/95">
            <div className="mb-1 flex items-center gap-1 font-semibold text-amber-200/95">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Partial feed
            </div>
            <ul className="list-inside list-disc space-y-0.5 text-amber-100/80">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {loading && !allItems.length ? (
          <div className="text-sm text-white/50">Loading recent activity…</div>
        ) : null}

        <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border border-white/10 bg-black/30 -mx-1 px-1 sm:mx-0 sm:px-0">
          <div className="w-full min-w-0 space-y-2 px-2 py-2 sm:px-3">
            {mergedItems.length === 0 && !loading && ready && channelTwitchId ? (
              <div className="space-y-1 text-sm text-white/55">
                <div>
                  No activity in the last{" "}
                  <span className="font-semibold text-emerald-200/90">
                    {ACTIVITY_FEED_WINDOW_LABELS[windowDays].replace(/^Last\s+/, "")}
                  </span>
                  .
                </div>
                {windowDays < ACTIVITY_FEED_WINDOW_DEFAULT ? (
                  <div className="text-white/45">
                    Try widening the time window (filter button → Time window) — your older follows, redemptions,
                    polls, and predictions are hidden by the current setting.
                  </div>
                ) : isSelfChannel ? (
                  <div className="text-white/45">
                    Real-time events (cheers, raids, hype trains, goals, polls, predictions, shoutouts) will appear
                    here the moment they happen.
                  </div>
                ) : (
                  <div className="text-white/45">
                    Switch to your own Twitch channel to receive real-time events. Helix snapshots only cover
                    follows and channel point redemptions for moderated channels.
                  </div>
                )}
              </div>
            ) : null}
            <AnimatePresence initial={false} mode="popLayout">
              {filteredItems.map((e) => (
                <motion.div
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 8, transition: { duration: 0.18 } }}
                  transition={{ type: "spring", stiffness: 520, damping: 34 }}
                  className="flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/40 ring-1 ring-emerald-500/15">
                    <KindIcon kind={e.kind} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">
                      <ActivityRowText row={e} />
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-cyan-300/80">
                      {ACTIVITY_FEED_KIND_LABELS[e.kind]}
                    </div>
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-xs tabular-nums text-emerald-200/85">
                    {formatActivityTimeAgo(e.ts, nowMs)}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </DockShell>
  );
}
