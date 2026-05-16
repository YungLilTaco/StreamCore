"use client";

import * as React from "react";
import {
  type ActivityFeedItemDTO,
  ACTIVITY_FEED_KIND_KEYS,
  coerceActivityFeedKind
} from "@/lib/twitch-activity-feed-model";
import { eventSubPayloadToActivityRow, eventSubTierLabel } from "@/lib/twitch-eventsub-types";

const WS_URL = "wss://eventsub.wss.twitch.tv/ws";

/**
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 * DURABLE LIVE-EVENTS PERSISTENCE — RULES FOR FUTURE EDITORS
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   1. The buffer at `localStorage["sv_activity_feed_live_v2_<channelTwitchId>"]` is treated as
 *      an APPEND-ONLY log of EventSub activity. Once an event is persisted it must survive every
 *      remount, hot reload, channel switch, and future refactor.
 *
 *   2. The ONLY function allowed to remove items is `clearPersistedLive(channelTwitchId)`, and
 *      it is only ever called from the user-facing `clearLive()` action returned by this hook.
 *      Anything else that wants to write must go through `persistLive(channelId, items)` which
 *      is implemented as a MERGE — `items` is unioned with whatever is already on disk, deduped
 *      by `id`, sorted, and capped. Calling `persistLive(channelId, [])` is a no-op by design.
 *
 *   3. The cap (`LIVE_EVENTS_CAP`) only bounds in-memory and on-disk size; oldest events fall off
 *      the end. Raise it rather than dropping events.
 *
 *   4. New persisted fields must be added to BOTH `readPersistedLive` (with a defensive
 *      `optionalStr`/`optionalNum` check) AND the merge in `persistLive` (so the more recent
 *      writer wins per id). Never strip an unknown field — that would corrupt forward-compat.
 *
 *   5. The storage key was bumped to `_v2_` when we switched to merge-on-write so any client
 *      still running the destructive v1 code keeps writing its own bucket and can't trash the
 *      new durable bucket on rollback.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 */
const LIVE_EVENTS_STORAGE_KEY_PREFIX = "sv_activity_feed_live_v2_";
const LEGACY_LIVE_EVENTS_STORAGE_KEY_PREFIX = "sv_activity_feed_live_v1_";
const LIVE_EVENTS_CAP = 1000;

const RECONNECT_INITIAL_MS = 1500;
const RECONNECT_MAX_MS = 30_000;
/** How long to wait for the paired half (gift↔recipient) before falling back to a partial row. */
const GIFT_PAIRING_WINDOW_MS = 5000;

export type EventSubStatus =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "subscribing"; succeeded: number; failed: number }
  | { phase: "live"; succeeded: number; failed: number }
  | { phase: "disconnected"; nextAttemptMs: number }
  | { phase: "error"; message: string };

type IncomingMessage = {
  metadata: {
    message_id: string;
    message_timestamp: string;
    message_type: string;
    subscription_type?: string;
  };
  payload: {
    session?: { id: string; reconnect_url?: string | null };
    event?: Record<string, unknown>;
  };
};

type SubscribeApiResponse = {
  succeeded: number;
  failed: { type: string; status: number; message: string }[];
  error?: string;
};

/** Parse one stored row defensively, dropping garbage but keeping the rest of the array. */
function parseStoredRow(raw: unknown): ActivityFeedItemDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const rawKind = typeof row.kind === "string" ? row.kind : null;
  const kind = rawKind ? coerceActivityFeedKind(rawKind) : null;
  const text = typeof row.text === "string" ? row.text : null;
  const ts = typeof row.ts === "number" ? row.ts : Number(row.ts);
  if (!id || !kind || !text || !Number.isFinite(ts)) return null;
  if (!ACTIVITY_FEED_KIND_KEYS.includes(kind)) return null;
  const optionalStr = (k: string): string | undefined =>
    typeof row[k] === "string" ? (row[k] as string) : undefined;
  const rawCp = row.channelPointsRedemption;
  let channelPointsRedemption: ActivityFeedItemDTO["channelPointsRedemption"];
  if (rawCp && typeof rawCp === "object") {
    const o = rawCp as Record<string, unknown>;
    const rewardId = typeof o.rewardId === "string" ? o.rewardId : "";
    const redemptionId = typeof o.redemptionId === "string" ? o.redemptionId : "";
    const userInput = typeof o.userInput === "string" ? o.userInput : "";
    if (rewardId && redemptionId) {
      channelPointsRedemption = { rewardId, redemptionId, userInput };
    }
  }
  return {
    id,
    kind,
    text,
    ts,
    actorLogin: optionalStr("actorLogin"),
    actorTwitchId: optionalStr("actorTwitchId"),
    actorDisplayName: optionalStr("actorDisplayName"),
    targetLogin: optionalStr("targetLogin"),
    targetTwitchId: optionalStr("targetTwitchId"),
    targetDisplayName: optionalStr("targetDisplayName"),
    channelPointsRedemption
  };
}

function readBucket(key: string): ActivityFeedItemDTO[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ActivityFeedItemDTO[] = [];
    for (const item of parsed) {
      const row = parseStoredRow(item);
      if (row) out.push(row);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Returns everything currently persisted for `channelTwitchId`, transparently merging the new v2
 * bucket with any leftover v1 bucket from older builds (so upgrading never loses history). The
 * v1 key is read but never written; the merge is biased towards v2 entries on id collision.
 */
function readPersistedLive(channelTwitchId: string): ActivityFeedItemDTO[] {
  const v2 = readBucket(LIVE_EVENTS_STORAGE_KEY_PREFIX + channelTwitchId);
  const v1 = readBucket(LEGACY_LIVE_EVENTS_STORAGE_KEY_PREFIX + channelTwitchId);
  if (v1.length === 0) return v2;
  return mergeRows(v2, v1);
}

/**
 * Merge two row arrays. `primary` wins on id collision (its payload is preserved); rows unique
 * to `secondary` are appended. Result is sorted newest-first and capped to `LIVE_EVENTS_CAP`.
 *
 * Used by `persistLive` to guarantee that calling it with a partial / stale / empty `items`
 * argument never destroys anything that's already on disk.
 */
function mergeRows(primary: ActivityFeedItemDTO[], secondary: ActivityFeedItemDTO[]): ActivityFeedItemDTO[] {
  const byId = new Map<string, ActivityFeedItemDTO>();
  for (const row of primary) byId.set(row.id, row);
  for (const row of secondary) if (!byId.has(row.id)) byId.set(row.id, row);
  return Array.from(byId.values())
    .sort((a, b) => b.ts - a.ts || String(a.id).localeCompare(String(b.id)))
    .slice(0, LIVE_EVENTS_CAP);
}

/**
 * Durable, non-destructive write. ALWAYS merges with what's already on disk.
 *
 * Guarantees:
 *   - `persistLive(channelId, [])` is a no-op (the existing bucket is preserved verbatim).
 *   - Partial writes from a stale closure can't shrink the bucket — at worst they re-confirm
 *     what's already stored.
 *   - Duplicate ids resolve in favour of the in-memory copy (Twitch sends notifications once,
 *     so the in-memory row is the canonical payload).
 *   - Failures (JSON / quota) silently keep the previous on-disk state.
 *
 * To actually delete data, call `clearPersistedLive` — and only `clearLive()` from this hook
 * should ever do that.
 */
function persistLive(channelTwitchId: string, items: ActivityFeedItemDTO[]): void {
  if (typeof window === "undefined") return;
  const key = LIVE_EVENTS_STORAGE_KEY_PREFIX + channelTwitchId;
  try {
    const existing = readBucket(key);
    const merged = mergeRows(items, existing);
    if (merged.length === 0) return; // Never write an empty array here — clearPersistedLive owns deletion.
    localStorage.setItem(key, JSON.stringify(merged));
  } catch {
    /* ignore quota / corruption — leaving the previous bucket intact is the safe failure mode */
  }
}

/** Explicit deletion path. Wipes both the v2 and v1 buckets for `channelTwitchId`. */
function clearPersistedLive(channelTwitchId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LIVE_EVENTS_STORAGE_KEY_PREFIX + channelTwitchId);
    localStorage.removeItem(LEGACY_LIVE_EVENTS_STORAGE_KEY_PREFIX + channelTwitchId);
  } catch {
    /* ignore */
  }
}

/**
 * Owns one Twitch EventSub WebSocket per (enabled, channelTwitchId) tuple.
 *
 * Lifecycle:
 *  - On `session_welcome` with a new `session.id`, POSTs `/api/twitch/eventsub/subscribe` to
 *    register every subscription type the user has scopes for.
 *  - On `session_reconnect`, opens a new WS to the migration URL and does NOT re-subscribe
 *    (Twitch keeps the same `session.id` and migrates subscriptions automatically).
 *  - On `notification`, appends a new `ActivityFeedItemDTO` to local state + localStorage.
 *  - On unexpected close, reconnects to root URL with exponential backoff capped at 30s.
 *
 * Persistence: live events are persisted per-channel in `localStorage` so refreshing the page
 * keeps recent activity until it ages out or is replaced by snapshot data.
 */
export function useTwitchEventSub({
  enabled,
  channelTwitchId
}: {
  enabled: boolean;
  channelTwitchId: string | null;
}): {
  status: EventSubStatus;
  liveEvents: ActivityFeedItemDTO[];
  clearLive: () => void;
} {
  /**
   * Seed `liveEvents` synchronously from `localStorage` on the very first render. The merge-on-
   * write semantics in `persistLive` already make the buffer impossible to wipe by accident, but
   * lazy-init still matters because:
   *
   *   - The very first paint shows the user their persisted history without a one-frame flash
   *     of an empty feed (which the read-in-useEffect pattern would cause).
   *   - It eliminates a redundant `[]` → `persisted` state churn on every mount.
   */
  const [liveEvents, setLiveEvents] = React.useState<ActivityFeedItemDTO[]>(() =>
    typeof window === "undefined" || !channelTwitchId ? [] : readPersistedLive(channelTwitchId)
  );
  const [status, setStatus] = React.useState<EventSubStatus>({ phase: "idle" });

  /**
   * Channel-switch reload. Tracks "did the channel id actually change since last commit?" — if
   * not, we skip the read entirely. This avoids a spurious `setLiveEvents` (and the matching
   * persist) on every render when only unrelated state moves.
   *
   * Note: even if a stale render persisted channel A's events under channel B's key, the merge
   * in `persistLive` would just *add* those rows to B's bucket rather than corrupt it. The check
   * here is a perf nicety, not a correctness requirement.
   */
  const lastLoadedChannelRef = React.useRef<string | null>(channelTwitchId);

  React.useEffect(() => {
    if (lastLoadedChannelRef.current === channelTwitchId) return;
    lastLoadedChannelRef.current = channelTwitchId;
    setLiveEvents(channelTwitchId ? readPersistedLive(channelTwitchId) : []);
  }, [channelTwitchId]);

  /**
   * Persist on every change. Safe to call unconditionally because:
   *   - `persistLive` MERGES with the on-disk bucket (never destructive).
   *   - `persistLive(channelId, [])` is a no-op, so empty-state moments are harmless.
   *   - `clearPersistedLive` is the only function that actually removes data, and it's only
   *     invoked from the explicit `clearLive()` action below.
   */
  React.useEffect(() => {
    if (!channelTwitchId) return;
    persistLive(channelTwitchId, liveEvents);
  }, [channelTwitchId, liveEvents]);

  // WebSocket lifecycle — re-created when `enabled` or `channelTwitchId` change.
  React.useEffect(() => {
    if (!enabled || !channelTwitchId) {
      setStatus({ phase: "idle" });
      return;
    }

    let cancelled = false;
    let currentWs: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let backoffMs = RECONNECT_INITIAL_MS;
    let lastSessionId: string | null = null;
    let pendingReconnectUrl: string | null = null;

    /**
     * Gift-event pairing state.
     *
     * Twitch fires `channel.subscription.gift` (carries gifter + total + tier, NO recipient) and
     * one `channel.subscribe` with `is_gift=true` per recipient (carries recipient + tier, NO
     * gifter). To render Twitch's standard "Gifter gifted a Tier X sub to Recipient" line we have
     * to correlate the two halves. They have no shared id, so we match by `tier` within a 5s
     * window — events typically arrive within ~100ms of each other.
     */
    type PendingGift = {
      gifter: string;
      /** Gifter's lowercase Twitch login (for clickable name in popover). */
      gifterLogin?: string;
      gifterTwitchId?: string;
      gifterDisplayName?: string;
      tier: string;
      remaining: number;
      ts: number;
      gifterMessageId: string;
      cleanupTimer: number;
    };
    type OrphanRecipient = {
      recipient: string;
      recipientLogin?: string;
      recipientTwitchId?: string;
      recipientDisplayName?: string;
      tier: string;
      ts: number;
      messageId: string;
      fallbackTimer: number;
    };
    const pendingGifts: PendingGift[] = [];
    const orphanRecipients: OrphanRecipient[] = [];

    const pushLive = (row: ActivityFeedItemDTO) => {
      setLiveEvents((prev) => {
        if (prev.some((p) => p.id === row.id)) return prev;
        const next = [row, ...prev];
        next.sort((a, b) => b.ts - a.ts);
        return next.slice(0, LIVE_EVENTS_CAP);
      });
    };
    const pushLiveMany = (rows: ActivityFeedItemDTO[]) => {
      if (rows.length === 0) return;
      setLiveEvents((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const filtered = rows.filter((r) => !seen.has(r.id));
        if (filtered.length === 0) return prev;
        const next = [...filtered, ...prev];
        next.sort((a, b) => b.ts - a.ts);
        return next.slice(0, LIVE_EVENTS_CAP);
      });
    };

    const clearPairingBuffers = () => {
      for (const g of pendingGifts) window.clearTimeout(g.cleanupTimer);
      for (const o of orphanRecipients) window.clearTimeout(o.fallbackTimer);
      pendingGifts.length = 0;
      orphanRecipients.length = 0;
    };

    const open = (url: string) => {
      if (cancelled) return;
      setStatus({ phase: "connecting" });
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        setStatus({ phase: "error", message: (e as Error).message || "WebSocket open failed" });
        scheduleReconnect();
        return;
      }
      currentWs = ws;

      ws.onopen = () => {
        backoffMs = RECONNECT_INITIAL_MS;
      };

      ws.onmessage = async (evt) => {
        let msg: IncomingMessage;
        try {
          msg = JSON.parse(evt.data) as IncomingMessage;
        } catch {
          return;
        }

        const messageType = msg.metadata?.message_type;
        if (!messageType) return;

        if (messageType === "session_welcome") {
          const sessionId = msg.payload?.session?.id;
          if (!sessionId) return;

          if (sessionId === lastSessionId) {
            // Migration to reconnect URL preserves the session id and subscriptions — do nothing.
            setStatus({ phase: "live", succeeded: 0, failed: 0 });
            return;
          }

          lastSessionId = sessionId;
          setStatus({ phase: "subscribing", succeeded: 0, failed: 0 });
          try {
            const res = await fetch("/api/twitch/eventsub/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId, channelTwitchId }),
              cache: "no-store"
            });
            const json = (await res.json().catch(() => ({}))) as SubscribeApiResponse;
            if (cancelled) return;
            if (!res.ok) {
              setStatus({
                phase: "error",
                message: json.error || `Subscribe failed (HTTP ${res.status})`
              });
              return;
            }
            setStatus({
              phase: "live",
              succeeded: json.succeeded ?? 0,
              failed: Array.isArray(json.failed) ? json.failed.length : 0
            });
          } catch (e) {
            if (cancelled) return;
            setStatus({ phase: "error", message: (e as Error).message || "Subscribe failed" });
          }
          return;
        }

        if (messageType === "session_keepalive") return;

        if (messageType === "session_reconnect") {
          const newUrl = msg.payload?.session?.reconnect_url;
          if (newUrl) {
            pendingReconnectUrl = newUrl;
            // Twitch closes the old socket once we open the new one. Force-close to trigger our
            // `onclose`, which will then connect to `pendingReconnectUrl` without backoff.
            try {
              ws.close();
            } catch {
              /* ignore */
            }
          }
          return;
        }

        if (messageType === "notification") {
          const type = msg.metadata?.subscription_type;
          if (!type) return;

          // Gift-pairing: intercept the two halves before the generic mapper runs.
          if (type === "channel.subscription.gift" || (type === "channel.subscribe" && msg.payload?.event?.is_gift === true)) {
            handleGiftEvent(type, msg);
            return;
          }

          const row = eventSubPayloadToActivityRow(type, msg);
          if (!row) return;
          pushLive(row);

          if (type === "channel.channel_points_custom_reward_redemption.add" && channelTwitchId) {
            const ev = msg.payload?.event;
            if (ev && typeof ev === "object") {
              void fetch("/api/twitch/channel-redemptions/ingest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ channelTwitchId, event: ev })
              }).catch(() => {});
            }
          }
          return;
        }

        // Other message types (revocation, etc.) — ignore quietly; UI still works.
      };

      ws.onclose = () => {
        if (currentWs === ws) currentWs = null;
        if (cancelled) return;
        if (pendingReconnectUrl) {
          const url = pendingReconnectUrl;
          pendingReconnectUrl = null;
          open(url);
          return;
        }
        scheduleReconnect();
      };

      ws.onerror = () => {
        // Browser will follow up with onclose; nothing else to do here.
      };
    };

    /**
     * Pair `channel.subscription.gift` with each `channel.subscribe is_gift=true` by `tier`.
     *
     * - If the recipient half arrives first: buffer it (`orphanRecipients`) and start a 5s timer
     *   that, on expiry, emits the partial row "Anonymous gifted a Tier X sub to <recipient>".
     * - If the gifter half arrives first: greedily consume any matching orphans up to `total`,
     *   then buffer the remaining slots in `pendingGifts` with a 5s timer that, on expiry, falls
     *   back to "<gifter> gifted N × Tier X sub(s)" for unmatched recipients.
     * - When both halves are present we emit a single combined row per recipient and do NOT emit
     *   a separate "<recipient> subscribed" line — that's the duplicate the user is removing.
     */
    const handleGiftEvent = (type: string, msg: IncomingMessage) => {
      const e = (msg.payload?.event ?? {}) as Record<string, unknown>;
      const ts = Date.parse(msg.metadata.message_timestamp) || Date.now();
      const messageId = msg.metadata.message_id;
      const tier = typeof e.tier === "string" ? e.tier : "1000";
      const str = (k: string): string | undefined => (typeof e[k] === "string" ? (e[k] as string) : undefined);

      if (type === "channel.subscription.gift") {
        const total = typeof e.total === "number" ? e.total : 1;
        const isAnon = e.is_anonymous === true;
        const gifterLogin = isAnon ? undefined : str("user_login");
        const gifterTwitchId = isAnon ? undefined : str("user_id");
        const gifterDisplayName = isAnon ? undefined : str("user_name");
        const gifter = isAnon ? "Anonymous" : gifterDisplayName || gifterLogin || "Someone";

        // Consume any orphan recipients waiting for a gifter (same tier, FIFO).
        const paired: ActivityFeedItemDTO[] = [];
        let remaining = total;
        for (let i = 0; i < orphanRecipients.length && remaining > 0; ) {
          const o = orphanRecipients[i]!;
          if (o.tier === tier) {
            window.clearTimeout(o.fallbackTimer);
            paired.push({
              id: `evtsub-pair-${o.messageId}`,
              kind: "gift_sub",
              text: `${gifter} gifted a ${eventSubTierLabel(tier)} sub to ${o.recipient}`,
              ts: o.ts,
              actorLogin: gifterLogin,
              actorTwitchId: gifterTwitchId,
              actorDisplayName: gifterDisplayName,
              targetLogin: o.recipientLogin,
              targetTwitchId: o.recipientTwitchId,
              targetDisplayName: o.recipientDisplayName
            });
            orphanRecipients.splice(i, 1);
            remaining--;
          } else {
            i++;
          }
        }
        pushLiveMany(paired);

        // Any unmatched slots wait for upcoming recipient events.
        if (remaining > 0) {
          const cleanupTimer = window.setTimeout(() => {
            const idx = pendingGifts.findIndex((g) => g.gifterMessageId === messageId);
            if (idx < 0) return;
            const g = pendingGifts[idx]!;
            pendingGifts.splice(idx, 1);
            // Fallback: emit a count-only row for the leftover recipients we never saw.
            pushLive({
              id: `evtsub-${messageId}`,
              kind: "gift_sub",
              text: `${g.gifter} gifted ${g.remaining} × ${eventSubTierLabel(g.tier)} sub${g.remaining === 1 ? "" : "s"}`,
              ts: g.ts,
              actorLogin: g.gifterLogin,
              actorTwitchId: g.gifterTwitchId,
              actorDisplayName: g.gifterDisplayName
            });
          }, GIFT_PAIRING_WINDOW_MS);
          pendingGifts.push({
            gifter,
            gifterLogin,
            gifterTwitchId,
            gifterDisplayName,
            tier,
            remaining,
            ts,
            gifterMessageId: messageId,
            cleanupTimer
          });
        }
        return;
      }

      // type === "channel.subscribe" with is_gift=true → recipient half.
      const recipientLogin = str("user_login");
      const recipientTwitchId = str("user_id");
      const recipientDisplayName = str("user_name");
      const recipient = recipientDisplayName || recipientLogin || "Someone";

      const match = pendingGifts.find((g) => g.tier === tier && g.remaining > 0);
      if (match) {
        match.remaining--;
        if (match.remaining === 0) {
          window.clearTimeout(match.cleanupTimer);
          const idx = pendingGifts.indexOf(match);
          if (idx >= 0) pendingGifts.splice(idx, 1);
        }
        pushLive({
          id: `evtsub-pair-${messageId}`,
          kind: "gift_sub",
          text: `${match.gifter} gifted a ${eventSubTierLabel(tier)} sub to ${recipient}`,
          ts,
          actorLogin: match.gifterLogin,
          actorTwitchId: match.gifterTwitchId,
          actorDisplayName: match.gifterDisplayName,
          targetLogin: recipientLogin,
          targetTwitchId: recipientTwitchId,
          targetDisplayName: recipientDisplayName
        });
        return;
      }

      // No gifter buffered yet — wait briefly for one, then fall back.
      const fallbackTimer = window.setTimeout(() => {
        const idx = orphanRecipients.findIndex((o) => o.messageId === messageId);
        if (idx < 0) return;
        const o = orphanRecipients[idx]!;
        orphanRecipients.splice(idx, 1);
        pushLive({
          id: `evtsub-pair-${o.messageId}`,
          kind: "gift_sub",
          text: `Anonymous gifted a ${eventSubTierLabel(o.tier)} sub to ${o.recipient}`,
          ts: o.ts,
          targetLogin: o.recipientLogin,
          targetTwitchId: o.recipientTwitchId,
          targetDisplayName: o.recipientDisplayName
        });
      }, GIFT_PAIRING_WINDOW_MS);
      orphanRecipients.push({
        recipient,
        recipientLogin,
        recipientTwitchId,
        recipientDisplayName,
        tier,
        ts,
        messageId,
        fallbackTimer
      });
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
      setStatus({ phase: "disconnected", nextAttemptMs: delay });
      reconnectTimer = window.setTimeout(() => {
        lastSessionId = null; // root URL gives a fresh session id; need to re-subscribe.
        open(WS_URL);
      }, delay);
    };

    open(WS_URL);

    return () => {
      cancelled = true;
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (currentWs) {
        try {
          currentWs.close();
        } catch {
          /* ignore */
        }
        currentWs = null;
      }
      clearPairingBuffers();
      setStatus({ phase: "idle" });
    };
  }, [enabled, channelTwitchId]);

  /**
   * Explicit user-initiated wipe. This is the ONLY path allowed to remove persisted history:
   *   - clears in-memory state, and
   *   - directly calls `clearPersistedLive` to remove the bucket from `localStorage`.
   *
   * The persist effect below will see the resulting `liveEvents=[]` but `persistLive` is a no-op
   * on empty input, so it won't re-create an empty bucket either. This split is deliberate so
   * stray `setLiveEvents([])` calls anywhere else can never wipe durable state.
   */
  const clearLive = React.useCallback(() => {
    if (channelTwitchId) clearPersistedLive(channelTwitchId);
    setLiveEvents([]);
  }, [channelTwitchId]);

  return { status, liveEvents, clearLive };
}
