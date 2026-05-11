"use client";

/**
 * Twitch-style user profile popover.
 *
 * Wrap any clickable trigger element with `<UserProfilePopover login=...>` and clicking it opens
 * the card: avatar, badges, account age, follow date, sub status, moderation toolbar, and a
 * tabbed view of session activity (messages, warnings, timeouts, bans) for that user.
 *
 * Data flow:
 *   - Profile data is fetched lazily on first open from `/api/twitch/user-profile`. Result is
 *     cached in component state so re-opening the same popover (without unmounting) is instant.
 *   - Chat messages come from `useDashboardSession()`, filtered by display-name (case-insensitive).
 *   - Moderation history (warn/timeout/ban/unban) comes from `useDashboardSession().actionsFor(login)`.
 *     The history is session-local because Twitch's API does not expose per-user mod history.
 *   - Moderation actions POST to `/api/twitch/moderate` and on success append to the session log.
 */

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Ban, ShieldAlert, Loader2, X } from "lucide-react";
import { cn } from "@/components/lib/cn";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import {
  useMaybeDashboardSession,
  type ModAction,
  type ModActionType
} from "@/components/app/DashboardSessionProvider";

/** Same map shape the chat dock already builds for inline badges; passed in so we don't refetch. */
export type ChatBadgeMap = Record<string, Record<string, { url: string; title: string }>>;

type ArchivedMessage = {
  id: string;
  ircId: string;
  text: string;
  ts: number;
  badges: string | null;
  color: string | null;
  displayName: string;
  deletedAt: string | null;
};

type ArchiveResponse = {
  items: ArchivedMessage[];
  nextBefore: number | null;
  error?: string;
};

type ProfileResponse = {
  user: {
    id: string;
    login: string;
    displayName: string;
    type: "" | "staff" | "admin" | "global_mod" | null;
    broadcasterType: "" | "partner" | "affiliate" | null;
    description: string | null;
    profileImageUrl: string | null;
    createdAt: string | null;
  };
  follow: { followedAt: string } | null;
  subscription: { tier: string; isGift: boolean } | null;
  ban: { bannedAt: string; expiresAt: string | null; reason: string | null } | null;
  warnings: string[];
  error?: string;
};

/** Ordered list of timeout durations shown as the inline buttons row, mirroring Twitch's UI. */
const TIMEOUT_OPTIONS: { label: string; seconds: number }[] = [
  { label: "1s", seconds: 1 },
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "10m", seconds: 600 },
  { label: "30m", seconds: 1800 },
  { label: "1h", seconds: 3600 },
  { label: "4h", seconds: 14400 },
  { label: "12h", seconds: 43200 },
  { label: "1d", seconds: 86400 },
  { label: "7d", seconds: 604800 },
  { label: "14d", seconds: 1209600 }
];

type TabKey = "messages" | "warnings" | "timeouts" | "bans";

function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function tierLabel(tier: string | undefined): string {
  if (tier === "3000") return "Tier 3";
  if (tier === "2000") return "Tier 2";
  if (tier === "1000") return "Tier 1";
  return tier ?? "";
}

/** Pull the `subscriber/<months>` version code out of the badges tag for the "Subscribed for N months" line. */
function subMonthsFromBadges(badgesTag: string | undefined | null): number | null {
  if (!badgesTag) return null;
  for (const part of badgesTag.split(",")) {
    const [setId, version] = part.split("/");
    if (setId === "subscriber" && version) {
      const n = Number(version);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function BadgeIcons({ badgesTag, map }: { badgesTag: string; map: ChatBadgeMap }) {
  if (!badgesTag) return null;
  const pairs = badgesTag.split(",").filter(Boolean);
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {pairs.map((pair, i) => {
        const slash = pair.indexOf("/");
        const setId = slash > 0 ? pair.slice(0, slash) : pair;
        const versionId = slash > 0 ? pair.slice(slash + 1) : "1";
        const badge = map[setId]?.[versionId];
        if (!badge) return null;
        return (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={`${setId}-${versionId}-${i}`}
            src={badge.url}
            alt={badge.title}
            title={badge.title}
            className="h-4 w-4 shrink-0 select-none"
            loading="lazy"
            draggable={false}
          />
        );
      })}
    </span>
  );
}

export function UserProfilePopover({
  children,
  login,
  userTwitchId,
  displayName,
  color,
  badgesTag,
  badgeMap
}: {
  children: React.ReactNode;
  login: string;
  userTwitchId?: string;
  displayName?: string;
  color?: string;
  badgesTag?: string;
  badgeMap?: ChatBadgeMap;
}) {
  /**
   * Be lenient about provider scope: activity feed names may be clicked from contexts that
   * happen to not yet have a DashboardSessionProvider mounted. In that case we still want to
   * render the basic Twitch profile card, just without session messages / actions.
   */
  const session = useMaybeDashboardSession();
  const { channelTwitchId } = useSelectedChannel();

  const [open, setOpen] = React.useState(false);
  const [profile, setProfile] = React.useState<ProfileResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<TabKey>("messages");
  const [actionPending, setActionPending] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  /** "scope" → re-auth banner; "other" → vanilla red error block. Reset on every new action. */
  const [actionErrorKind, setActionErrorKind] = React.useState<"scope" | "other" | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  /**
   * Archived messages from `/api/twitch/chat-archive`. We page upwards (older first) using a
   * keyset cursor in `archiveBefore`. `archiveDone` flips once the server reports no more pages.
   *
   * The "snapshot" timestamp `openedAtMs` is fixed when the popover first opens — anything from
   * the session message stream with `ts > openedAtMs` is considered "live since you opened this
   * popover" and gets rendered below the LIVE divider, matching Twitch's UI.
   */
  const [archived, setArchived] = React.useState<ArchivedMessage[]>([]);
  const [archiveBefore, setArchiveBefore] = React.useState<number | null>(null);
  const [archiveLoading, setArchiveLoading] = React.useState(false);
  const [archiveDone, setArchiveDone] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const openedAtMsRef = React.useRef<number>(Date.now());
  const messagesScrollerRef = React.useRef<HTMLDivElement | null>(null);
  /** Track popover open transition so we can reset archive state cleanly on reopen. */
  const prevOpenRef = React.useRef(false);

  // Reset archive state every time the popover transitions to closed → open.
  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      openedAtMsRef.current = Date.now();
      setArchived([]);
      setArchiveBefore(null);
      setArchiveDone(false);
      setArchiveError(null);
    }
    prevOpenRef.current = open;
  }, [open]);

  /**
   * Standalone profile fetcher used both by the initial-open effect AND by `performAction` to
   * refresh the ban indicator immediately after a successful ban / timeout / unban.
   *
   * Returns a cancel handle so the open-effect can drop in-flight responses on unmount; for the
   * post-action call the cancel handle is ignored (the popover is already showing).
   */
  const fetchProfile = React.useCallback((): { cancel: () => void } => {
    if (!channelTwitchId) return { cancel: () => {} };
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ channelTwitchId, login: login.toLowerCase() });
    if (userTwitchId) qs.set("id", userTwitchId);
    fetch(`/api/twitch/user-profile?${qs}`, { cache: "no-store" })
      .then(async (r) => {
        const json = (await r.json().catch(() => ({}))) as ProfileResponse;
        if (cancelled) return;
        if (!r.ok) {
          setError(json.error || `Profile failed (HTTP ${r.status})`);
          setProfile(null);
        } else {
          setProfile(json);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError((e as Error).message || "Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return {
      cancel: () => {
        cancelled = true;
      }
    };
  }, [channelTwitchId, login, userTwitchId]);

  React.useEffect(() => {
    if (!open) return;
    const handle = fetchProfile();
    return handle.cancel;
  }, [open, fetchProfile]);

  const effectiveDisplay = profile?.user.displayName || displayName || login;
  const effectiveBadges = badgesTag ?? "";
  const subMonths = subMonthsFromBadges(effectiveBadges);

  /**
   * Session-live messages for this user — kept in ascending timestamp order (oldest → newest) so
   * we can render them at the bottom of the scroller like Twitch does, with newest at the
   * scroll-bottom and a "Jump to latest" anchor implicitly being the natural scroll position.
   */
  const sessionMessages = React.useMemo(() => {
    if (!session) return [];
    const lower = login.toLowerCase();
    const profileId = profile?.user.id;
    return session.chatMessages
      .filter((m) => {
        if (profileId && m.userId && m.userId === profileId) return true;
        if (m.userLogin && m.userLogin === lower) return true;
        return m.user.toLowerCase() === lower;
      })
      .slice()
      .sort((a, b) => a.ts - b.ts);
  }, [session, login, profile]);

  /**
   * Load one page of archived messages from the server. Two modes:
   *   - First page (`mode = "initial"`): no cursor; fetch the newest N messages.
   *   - Older page (`mode = "older"`): use `archiveBefore` as the exclusive upper bound on ts.
   *
   * We resolve the user reference in this priority: profile.user.id > userTwitchId prop > login.
   * The popover always renders an archive query as long as a channel is selected.
   */
  const loadArchivePage = React.useCallback(
    async (mode: "initial" | "older"): Promise<void> => {
      if (!channelTwitchId) return;
      if (archiveLoading) return;
      if (mode === "older" && (archiveDone || archiveBefore == null)) return;
      const targetId = profile?.user.id || userTwitchId || null;
      const targetLogin = login.toLowerCase();
      setArchiveLoading(true);
      setArchiveError(null);
      try {
        const qs = new URLSearchParams({
          channelTwitchId,
          limit: "50",
          ...(targetId ? { userTwitchId: targetId } : { userLogin: targetLogin })
        });
        if (mode === "older" && archiveBefore != null) qs.set("before", String(archiveBefore));
        const res = await fetch(`/api/twitch/chat-archive?${qs}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as ArchiveResponse;
        if (!res.ok) {
          setArchiveError(json.error || `Archive failed (HTTP ${res.status})`);
          return;
        }
        // `items` are oldest → newest. For the initial page that's already what we want at the top.
        // For an older page we prepend.
        setArchived((prev) => (mode === "initial" ? json.items : [...json.items, ...prev]));
        setArchiveBefore(json.nextBefore);
        if (json.nextBefore == null) setArchiveDone(true);
      } catch (e: unknown) {
        setArchiveError((e as Error).message || "Network error");
      } finally {
        setArchiveLoading(false);
      }
    },
    [channelTwitchId, profile, userTwitchId, login, archiveBefore, archiveDone, archiveLoading]
  );

  // Trigger the initial archive load the first time the user is on the Messages tab while open.
  React.useEffect(() => {
    if (!open) return;
    if (tab !== "messages") return;
    if (archived.length > 0 || archiveLoading || archiveDone || archiveError) return;
    void loadArchivePage("initial");
  }, [open, tab, archived.length, archiveLoading, archiveDone, archiveError, loadArchivePage]);

  // Scroll-up handler: when within 60px of the top, ask for the next older page.
  const onMessagesScroll = React.useCallback<React.UIEventHandler<HTMLDivElement>>(
    (e) => {
      const el = e.currentTarget;
      if (el.scrollTop < 60 && !archiveLoading && !archiveDone && archiveBefore != null) {
        // Capture height so we can keep the user's scroll position pinned after we prepend rows.
        const prevHeight = el.scrollHeight;
        void loadArchivePage("older").then(() => {
          requestAnimationFrame(() => {
            const target = messagesScrollerRef.current;
            if (target) target.scrollTop = target.scrollHeight - prevHeight + el.scrollTop;
          });
        });
      }
    },
    [archiveLoading, archiveDone, archiveBefore, loadArchivePage]
  );

  /**
   * Merge archive + session messages, deduped by ircId. Session messages that arrived AFTER the
   * popover opened render below a "LIVE" divider; everything else renders chronologically above
   * it. Newest at the bottom, oldest at the top — same as Twitch's UI in the screenshot.
   */
  const { historyRows, liveRows, hasLiveDivider } = React.useMemo(() => {
    const seen = new Set<string>(archived.map((a) => a.ircId));
    const openedAt = openedAtMsRef.current;

    // Session messages from before openedAt that weren't archived yet (recent + not flushed).
    // We carry `deleted` over so the in-popover row also renders struck-through when a CLEARCHAT
    // landed before the archive flushed; otherwise the popover would briefly look "clean" until
    // the next archive page refetched the row with `deletedAt` populated.
    const deletedMarker = "session-deleted";
    const sessionPreLive = sessionMessages
      .filter((m) => m.ts < openedAt && !seen.has(m.id))
      .map((m) => ({
        id: `live-${m.id}`,
        ircId: m.id,
        text: m.text,
        ts: m.ts,
        badges: m.badges,
        color: m.color,
        displayName: m.user,
        deletedAt: m.deleted ? deletedMarker : null
      } as ArchivedMessage));

    for (const r of sessionPreLive) seen.add(r.ircId);

    const history = [...archived, ...sessionPreLive].sort((a, b) => a.ts - b.ts);

    const liveOnly = sessionMessages
      .filter((m) => m.ts >= openedAt && !seen.has(m.id))
      .map((m) => ({
        id: `live-${m.id}`,
        ircId: m.id,
        text: m.text,
        ts: m.ts,
        badges: m.badges,
        color: m.color,
        displayName: m.user,
        deletedAt: m.deleted ? deletedMarker : null
      } as ArchivedMessage));

    return {
      historyRows: history,
      liveRows: liveOnly,
      hasLiveDivider: liveOnly.length > 0
    };
  }, [archived, sessionMessages]);

  const sessionActions = session?.actionsFor(login) ?? [];
  const totalMessages = historyRows.length + liveRows.length;
  const counts = {
    messages: totalMessages,
    /** Twitch caps the number at "1000+" — we do the same when we know more pages are available. */
    messagesLabel: !archiveDone && totalMessages > 0 ? `${totalMessages}+` : String(totalMessages),
    warnings: sessionActions.filter((a) => a.type === "warn").length,
    timeouts: sessionActions.filter((a) => a.type === "timeout").length,
    bans: sessionActions.filter((a) => a.type === "ban").length
  };

  /**
   * Classify an HTTP error from `/api/twitch/moderate` (or the Twitch error it bubbled up).
   *
   *   "scope" — token is missing a required scope. The user needs to disconnect StreamCore on
   *             twitch.tv → Settings → Connections and re-authorize. We show a dedicated banner
   *             with a link rather than the cryptic Twitch error verbatim.
   *   "other" — anything else: 403 (not authorized as mod), 400 (invalid duration), network
   *             error, etc. We surface the message as-is.
   */
  const classifyError = (status: number, msg: string): "scope" | "other" => {
    const m = msg.toLowerCase();
    if (status === 401) return "scope";
    if (m.includes("missing scope") || m.includes("token is missing") || m.includes("insufficient")) return "scope";
    return "other";
  };

  /** Friendly per-action verb for the success toast. */
  const successLabel = (
    type: Exclude<ModActionType, "unban"> | "unban",
    durationSec?: number
  ): string => {
    if (type === "ban") return "Banned";
    if (type === "unban") return "Unbanned";
    if (type === "warn") return "Warning sent";
    return `Timed out for ${formatDuration(durationSec ?? 0)}`;
  };

  const performAction = React.useCallback(
    async (
      type: Exclude<ModActionType, "unban"> | "unban",
      opts?: { durationSec?: number; reason?: string }
    ) => {
      if (!channelTwitchId) return;
      const targetId = profile?.user.id || userTwitchId;
      if (!targetId) {
        setActionError("User id not loaded yet — wait a moment and try again.");
        setActionErrorKind("other");
        return;
      }
      const slug = type === "timeout" ? `timeout-${opts?.durationSec ?? 0}` : type;
      setActionPending(slug);
      setActionError(null);
      setActionErrorKind(null);
      setActionSuccess(null);
      try {
        const res = await fetch("/api/twitch/moderate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: type,
            channelTwitchId,
            userTwitchId: targetId,
            durationSec: opts?.durationSec,
            reason: opts?.reason
          }),
          cache: "no-store"
        });
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        if (!res.ok) {
          const msg = body.message || body.error || `HTTP ${res.status}`;
          setActionError(msg);
          setActionErrorKind(classifyError(res.status, msg));
          return;
        }
        // Success path.
        session?.recordAction(login, {
          type,
          durationSec: opts?.durationSec,
          reason: opts?.reason
        });
        setActionSuccess(successLabel(type, opts?.durationSec));
        window.setTimeout(() => setActionSuccess(null), 3000);
        // Refresh profile so the ban indicator / Unban button reflect the new state immediately.
        fetchProfile();
      } catch (e: unknown) {
        setActionError((e as Error).message || "Network error");
        setActionErrorKind("other");
      } finally {
        setActionPending(null);
      }
    },
    [channelTwitchId, profile, userTwitchId, session, login, fetchProfile]
  );

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          side="bottom"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-[60] w-[360px] max-w-[calc(100vw-1rem)] rounded-xl border border-white/10 bg-zinc-950 text-white shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          )}
        >
          <div className="flex items-start gap-3 border-b border-white/10 p-3">
            <div className="relative shrink-0">
              {profile?.user.profileImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={profile.user.profileImageUrl}
                  alt={effectiveDisplay}
                  className="h-12 w-12 rounded-full ring-2"
                  style={{ borderColor: color || "#9ca3af" }}
                />
              ) : (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-lg font-bold uppercase"
                  style={{ color: color || "#9ca3af" }}
                >
                  {effectiveDisplay.slice(0, 1)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 truncate">
                <span className="truncate text-base font-bold" style={{ color: color || "#e5e7eb" }}>
                  {effectiveDisplay}
                </span>
              </div>
              {effectiveBadges && badgeMap ? (
                <div className="mt-1">
                  <BadgeIcons badgesTag={effectiveBadges} map={badgeMap} />
                </div>
              ) : null}
              {profile?.user.broadcasterType ? (
                <div className="mt-0.5 text-[11px] uppercase tracking-wide text-white/55">
                  {profile.user.broadcasterType}
                </div>
              ) : null}
            </div>
            <PopoverPrimitive.Close
              className="rounded p-1 text-white/55 transition hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </PopoverPrimitive.Close>
          </div>

          <div className="space-y-1.5 border-b border-white/10 p-3 text-sm">
            {loading ? (
              <div className="flex items-center gap-2 text-white/55">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading profile…
              </div>
            ) : error ? (
              <div className="text-rose-300">{error}</div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-white/80">
                  <span className="text-base">🎂</span>
                  <span>Account created on {formatDateLong(profile?.user.createdAt)}</span>
                </div>
                {profile?.follow ? (
                  <div className="flex items-center gap-2 text-white/80">
                    <span className="text-base">❤️</span>
                    <span>Following since {formatDateLong(profile.follow.followedAt)}</span>
                  </div>
                ) : null}
                {profile?.subscription ? (
                  <div className="flex items-center gap-2 text-white/80">
                    <span className="text-base">⭐</span>
                    <span>
                      {tierLabel(profile.subscription.tier)}
                      {subMonths != null ? ` · Subscribed for ${subMonths} month${subMonths === 1 ? "" : "s"}` : ""}
                      {profile.subscription.isGift ? " · (Gift)" : ""}
                    </span>
                  </div>
                ) : null}
                {profile?.ban ? (
                  <div className="flex items-center gap-2 text-rose-300">
                    <Ban className="h-3.5 w-3.5" />
                    <span>
                      {profile.ban.expiresAt ? "Timed out until " : "Banned since "}
                      {formatDateShort(profile.ban.expiresAt || profile.ban.bannedAt)}
                      {profile.ban.reason ? ` — ${profile.ban.reason}` : ""}
                    </span>
                  </div>
                ) : null}
                {profile?.warnings.length ? (
                  <div className="text-[11px] text-amber-200/80">{profile.warnings.join(" ")}</div>
                ) : null}
              </>
            )}
          </div>

          <div className="space-y-2 border-b border-white/10 p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => performAction("ban")}
                disabled={actionPending !== null}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-2.5 text-xs font-semibold text-rose-100 transition",
                  "hover:bg-rose-500/20 disabled:opacity-50"
                )}
              >
                {actionPending === "ban" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                Ban
              </button>
              <button
                type="button"
                onClick={() => performAction("warn")}
                disabled={actionPending !== null}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 text-xs font-semibold text-amber-100 transition",
                  "hover:bg-amber-500/20 disabled:opacity-50"
                )}
              >
                {actionPending === "warn" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5" />
                )}
                Warn
              </button>
              {profile?.ban ? (
                <button
                  type="button"
                  onClick={() => performAction("unban")}
                  disabled={actionPending !== null}
                  className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  Unban
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {TIMEOUT_OPTIONS.map((opt) => {
                const slug = `timeout-${opt.seconds}`;
                const isPending = actionPending === slug;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => performAction("timeout", { durationSec: opt.seconds })}
                    disabled={actionPending !== null}
                    className={cn(
                      "min-w-[2.25rem] rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-white/80 transition",
                      "hover:bg-white/[0.08] hover:text-white disabled:opacity-50",
                      isPending && "border-emerald-400/30 text-emerald-200"
                    )}
                  >
                    {isPending ? "…" : opt.label}
                  </button>
                );
              })}
            </div>

            {actionSuccess ? (
              <div className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-100 shadow-[0_0_12px_rgba(52,211,153,0.18)]">
                ✓ {actionSuccess}
              </div>
            ) : null}
            {actionError ? (
              actionErrorKind === "scope" ? (
                <div className="rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-2 text-xs text-amber-100">
                  <div className="font-semibold text-amber-50">Moderation scope missing</div>
                  <div className="mt-0.5 text-amber-100/90">{actionError}</div>
                  <div className="mt-1.5 text-[11px] leading-snug text-amber-100/80">
                    To grant the new moderation scopes:{" "}
                    <a
                      href="https://www.twitch.tv/settings/connections"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-amber-50 underline decoration-amber-300/70 hover:decoration-amber-50"
                    >
                      disconnect StreamCore on Twitch
                    </a>
                    , then sign out and back in here and approve the consent screen.
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-rose-400/40 bg-rose-500/15 px-2.5 py-1.5 text-xs text-rose-100">
                  <div className="font-semibold text-rose-50">Action failed</div>
                  <div className="mt-0.5">{actionError}</div>
                </div>
              )
            ) : null}
          </div>

          <div className="border-b border-white/10">
            <div className="flex items-stretch text-[11px] font-semibold uppercase tracking-wide">
              {(["messages", "warnings", "timeouts", "bans"] as TabKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-0.5 py-2 transition",
                    tab === key
                      ? "border-b-2 border-emerald-400 text-white"
                      : "border-b-2 border-transparent text-white/55 hover:text-white"
                  )}
                >
                  <span className="text-sm font-bold tabular-nums">
                    {key === "messages"
                      ? counts.messagesLabel
                      : key === "warnings"
                      ? counts.warnings
                      : key === "timeouts"
                      ? counts.timeouts
                      : counts.bans}
                  </span>
                  <span className="capitalize">{key}</span>
                </button>
              ))}
            </div>
          </div>

          {tab === "messages" ? (
            <MessagesTab
              scrollerRef={messagesScrollerRef}
              onScroll={onMessagesScroll}
              archiveLoading={archiveLoading}
              archiveDone={archiveDone}
              archiveError={archiveError}
              historyRows={historyRows}
              liveRows={liveRows}
              hasLiveDivider={hasLiveDivider}
              totalCount={totalMessages}
              onRetry={() => loadArchivePage(archived.length === 0 ? "initial" : "older")}
            />
          ) : (
            <div className="max-h-[280px] overflow-y-auto p-3 text-sm">
              <SessionActionList type={tab} actions={sessionActions} />
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * The Messages tab body. Owns the scroller element (so `UserProfilePopover` can wire up scroll
 * position preservation when older pages are prepended) and renders the LIVE divider between
 * pre-open history and messages that arrived after the popover was opened.
 *
 * The scroller is `max-h-[280px]` to keep the popover from growing unbounded. On every render
 * after a new live message arrives we auto-scroll to the bottom IF the user was already pinned
 * there (within 24px) — otherwise we leave their scroll position alone so they don't lose their
 * place while reading older history.
 */
function MessagesTab({
  scrollerRef,
  onScroll,
  archiveLoading,
  archiveDone,
  archiveError,
  historyRows,
  liveRows,
  hasLiveDivider,
  totalCount,
  onRetry
}: {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: React.UIEventHandler<HTMLDivElement>;
  archiveLoading: boolean;
  archiveDone: boolean;
  archiveError: string | null;
  historyRows: ArchivedMessage[];
  liveRows: ArchivedMessage[];
  hasLiveDivider: boolean;
  totalCount: number;
  onRetry: () => void;
}) {
  const pinnedToBottomRef = React.useRef(true);

  const handleScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    const el = e.currentTarget;
    const distFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    pinnedToBottomRef.current = distFromBottom < 24;
    onScroll(e);
  };

  // Auto-scroll behaviour:
  //   - First render with rows → snap to bottom (newest message visible).
  //   - Subsequent renders → only stay pinned if the user was already at the bottom.
  const initializedRef = React.useRef(false);
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (!initializedRef.current && totalCount > 0) {
      initializedRef.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (pinnedToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [scrollerRef, totalCount, liveRows.length]);

  if (totalCount === 0 && !archiveLoading) {
    return (
      <div className="max-h-[280px] overflow-y-auto p-3 text-sm">
        {archiveError ? (
          <div className="space-y-2 text-xs">
            <div className="text-rose-300">{archiveError}</div>
            <button
              type="button"
              onClick={onRetry}
              className="rounded border border-white/15 bg-white/[0.05] px-2 py-0.5 text-white/80 transition hover:bg-white/[0.1]"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="text-xs text-white/45">No messages archived for this user yet.</div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      onScroll={handleScroll}
      className="max-h-[280px] overflow-y-auto p-3 text-sm"
    >
      {/* Header for the upper page: loading spinner, "load older", or "beginning of archive". */}
      <div className="mb-2 flex justify-center text-[11px] text-white/45">
        {archiveLoading ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading older messages…
          </span>
        ) : archiveDone ? (
          <span>Beginning of archive</span>
        ) : (
          <span>Scroll up to load older messages</span>
        )}
      </div>

      {archiveError ? (
        <div className="mb-2 rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">
          {archiveError}{" "}
          <button
            type="button"
            onClick={onRetry}
            className="font-semibold underline decoration-rose-300/60 hover:decoration-rose-100"
          >
            Retry
          </button>
        </div>
      ) : null}

      <ul className="space-y-1">
        {historyRows.map((m) => (
          <MessageRow key={m.id} row={m} />
        ))}
      </ul>

      {hasLiveDivider ? (
        <div className="my-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-300/90">
          <span className="h-px flex-1 bg-emerald-400/20" />
          Live
          <span className="h-px flex-1 bg-emerald-400/20" />
        </div>
      ) : null}

      {liveRows.length > 0 ? (
        <ul className="space-y-1">
          {liveRows.map((m) => (
            <MessageRow key={m.id} row={m} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MessageRow({ row }: { row: ArchivedMessage }) {
  const hh = new Date(row.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <li className={cn("flex gap-2", row.deletedAt && "opacity-60 line-through")}>
      <span className="w-10 shrink-0 text-[11px] tabular-nums text-white/40">{hh}</span>
      <span className="min-w-0 break-words text-white/85">{row.text}</span>
    </li>
  );
}

function SessionActionList({ type, actions }: { type: TabKey; actions: ModAction[] }) {
  const filterType: ModActionType = type === "warnings" ? "warn" : type === "timeouts" ? "timeout" : "ban";
  const filtered = actions.filter((a) => a.type === filterType);
  if (filtered.length === 0) {
    return <div className="text-xs text-white/45">No {type} this session.</div>;
  }
  return (
    <ul className="space-y-1.5">
      {filtered.map((a) => (
        <li key={a.id} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs">
          <div className="flex items-center justify-between gap-2 text-white/85">
            <span className="font-semibold capitalize">
              {a.type === "warn"
                ? "Warning"
                : a.type === "timeout"
                ? `Timeout · ${formatDuration(a.durationSec ?? 0)}`
                : "Ban"}
            </span>
            <span className="text-[10px] tabular-nums text-white/45">
              {new Date(a.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          {a.reason ? <div className="mt-0.5 text-white/65">{a.reason}</div> : null}
        </li>
      ))}
    </ul>
  );
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}
