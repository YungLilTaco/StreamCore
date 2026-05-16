"use client";

import * as React from "react";
import { twitchParentQueryString } from "@/lib/twitch-embed-parents";
import { twitchEmbedChatUrl } from "@/lib/twitch-popout-urls";
import { parseIrcLine, sanitizeChatText } from "@/lib/twitch-irc";

const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
const RECONNECT_INITIAL_MS = 1500;
const RECONNECT_MAX_MS = 30_000;
const MESSAGES_CAP = 250;

/**
 * Chat archive batch upload.
 *
 * Every incoming PRIVMSG is queued and POSTed to `/api/twitch/chat-archive` every
 * `ARCHIVE_FLUSH_INTERVAL_MS`. The server upserts by `(channelTwitchId, ircId)` so duplicates
 * are cheap on retries and on multiple moderators concurrently watching the same channel.
 *
 * Optimistic self-echoes are deliberately NOT uploaded — they have no real Twitch IRC id, and
 * any other moderator running the app would upload the same message with its proper id, so the
 * channel-wide archive stays clean.
 */
const ARCHIVE_FLUSH_INTERVAL_MS = 5000;
const ARCHIVE_BATCH_CAP = 50;

/**
 * Historical backfill from recent-messages.robotty.de (community Twitch chat buffer).
 *
 * Triggered once per channel on first chat connect, then throttled to at most once an hour per
 * channel via a localStorage timestamp. The result drops straight into `ChatMessageArchive`
 * server-side, so popovers immediately have ~800 messages of context to draw from.
 */
const BACKFILL_THROTTLE_MS = 60 * 60 * 1000;
const BACKFILL_STORAGE_KEY_PREFIX = "sv_chat_backfill_at_v1_";

/** Lowercase Twitch login: strip `#`, drop characters outside `[a-z0-9_]`. */
export function sanitizeTwitchChannelLogin(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Official embed chat `src` with CSP-safe `parent=` (includes `localhost` first for local dev).
 * Use from embed URL builders / any host so channel + parents stay aligned with IRC joins.
 */
export function resolvedTwitchEmbedChatSrc(broadcasterLogin: string | null | undefined): string | null {
  const login = sanitizeTwitchChannelLogin(broadcasterLogin);
  if (!login) return null;
  const parentQs = twitchParentQueryString();
  if (!parentQs.trim()) return null;
  return twitchEmbedChatUrl(login, parentQs);
}

type ArchiveRow = {
  ircId: string;
  userTwitchId: string;
  userLogin: string;
  displayName: string;
  color: string;
  text: string;
  badges: string;
  ts: number;
  isMod: boolean;
  isSubscriber: boolean;
};

/** Default colour for chatters who never picked one (Twitch normally serves these grey). */
const DEFAULT_CHAT_COLOR = "#9ca3af";

export type ChatMessage = {
  id: string;
  /** Author display name (`display-name` tag, falls back to `nick`). */
  user: string;
  /** Twitch user ID (`user-id` tag) — used by the user profile popover to avoid an extra login→id lookup. */
  userId: string;
  /** Lowercase IRC nick (`msg.nick`) — stable login key for filtering and popover lookups. */
  userLogin: string;
  /** Hex colour string (`#rrggbb`) or default grey. */
  color: string;
  text: string;
  /** Twitch `tmi-sent-ts` (epoch ms) or local `Date.now()` for our own optimistic echoes. */
  ts: number;
  /** Raw `badges` tag string, e.g. `moderator/1,subscriber/12`. */
  badges: string;
  isMod: boolean;
  isSubscriber: boolean;
  /** True for messages this client sent (optimistic echo since Twitch IRC doesn't reflect them). */
  self: boolean;
  /**
   * Soft-delete flag set by CLEARCHAT (timeout/ban) or CLEARMSG (single-line delete).
   *
   * The chat dock keeps deleted rows visible but replaces the body with a "(show message)
   * <status>" affordance — mods can still see context without scrolling forever. This mirrors
   * how Twitch's mod-view shows hidden messages.
   */
  deleted: boolean;
  /**
   * Which moderation event caused the soft-delete. Drives the inline status text:
   *   - "timeout"  → `user timed out for <duration>` (using `deletedTimeoutSec`)
   *   - "ban"      → `banned`
   *   - "message"  → `message deleted`
   * `null` exactly when `deleted` is false. Tracked separately from `deletedTimeoutSec` because
   * we can't distinguish a permanent ban from a single-line delete just from the duration.
   */
  deletedKind: "timeout" | "ban" | "message" | null;
  /**
   * Timeout length in seconds. Populated only when `deletedKind === "timeout"`; `null` for bans,
   * single-message deletes, and live (un-deleted) rows.
   */
  deletedTimeoutSec: number | null;
};

export type ChatStatus =
  | { phase: "idle" }
  | { phase: "loading-credentials" }
  | { phase: "connecting" }
  | { phase: "joining" }
  | { phase: "live" }
  | { phase: "disconnected"; nextAttemptMs: number }
  | { phase: "error"; message: string };

type ChatCredentials = {
  accessToken: string;
  userLogin: string;
  channelLogin: string;
  isSelf: boolean;
};

/**
 * Owns a single Twitch IRC WebSocket connection scoped to `(enabled, channelTwitchId)`.
 *
 * Connection sequence on `open`:
 *   1. `CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership` — enables IRCv3 tags
 *      (badges, colour, message id, sent-ts) plus extra Twitch commands (CLEARCHAT/CLEARMSG).
 *   2. `PASS oauth:<token>` — authenticates the bearer.
 *   3. `NICK <user_login>` — picks the IRC nick (must match the token's user).
 *   4. `JOIN #<channel_login>` — subscribes to the channel's PRIVMSG stream.
 *
 * Twitch sends frequent `PING` keepalives — we MUST echo back `PONG` or the connection drops
 * within ~5 minutes.
 *
 * Twitch IRC does NOT echo your own PRIVMSGs back to you, so `send()` synthesizes a local
 * message and inserts it into the UI immediately (`self: true`). Display name + colour come
 * from the most recent `USERSTATE` message Twitch sent us when we joined.
 */
export function useTwitchChat({
  enabled,
  channelTwitchId
}: {
  enabled: boolean;
  channelTwitchId: string | null;
}): {
  status: ChatStatus;
  messages: ChatMessage[];
  send: (text: string) => boolean;
} {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [status, setStatus] = React.useState<ChatStatus>({ phase: "idle" });
  const wsRef = React.useRef<WebSocket | null>(null);
  const credsRef = React.useRef<ChatCredentials | null>(null);
  const selfStateRef = React.useRef<{ displayName: string; userId: string; color: string; badges: string } | null>(
    null
  );
  /** Buffer of PRIVMSGs awaiting the next archive flush. Drained by the periodic upload effect. */
  const archiveQueueRef = React.useRef<ArchiveRow[]>([]);

  /**
   * Fire-and-forget archive soft-delete announcements. CLEARCHAT / CLEARMSG events from Twitch
   * update three things in lockstep:
   *   1. In-memory chat state (the `setMessages` calls in the IRC handler) — instant UI update.
   *   2. Persistent archive `deletedAt` (this helper) — so the popover and any other client sees
   *      the deletion next time it loads.
   *
   * Failures are intentionally silent: the on-screen state is already correct, and the live
   * stream is the authoritative source of further deletions. We don't retry because the same
   * CLEARCHAT can arrive over IRC again on reconnect.
   */
  const announceDeletion = React.useCallback(
    (payload: { ircId?: string; userLogin?: string; allInChannel?: boolean }) => {
      if (!channelTwitchId) return;
      try {
        const blob = new Blob([JSON.stringify({ channelTwitchId, ...payload })], {
          type: "application/json"
        });
        // `sendBeacon` is fire-and-forget AND survives navigation, which fits the semantics here.
        if (navigator.sendBeacon?.("/api/twitch/chat-archive/delete", blob)) return;
      } catch {
        /* fall through to fetch */
      }
      fetch("/api/twitch/chat-archive/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelTwitchId, ...payload }),
        cache: "no-store",
        keepalive: true
      }).catch(() => {
        /* best-effort */
      });
    },
    [channelTwitchId]
  );

  const enqueueSingleDelete = React.useCallback(
    (ircId: string) => announceDeletion({ ircId }),
    [announceDeletion]
  );
  const enqueueUserClear = React.useCallback(
    (userLogin: string) => announceDeletion({ userLogin }),
    [announceDeletion]
  );
  const enqueueChannelClear = React.useCallback(
    () => announceDeletion({ allInChannel: true }),
    [announceDeletion]
  );

  // Reset per-channel buffer so previous channel chat doesn't leak.
  React.useEffect(() => {
    setMessages([]);
    selfStateRef.current = null;
    archiveQueueRef.current = [];
  }, [channelTwitchId]);

  /**
   * One-shot historical backfill — pulled from the community recent-messages server on first
   * connect per channel. Throttled to once per hour per channel; duplicate inserts are absorbed
   * server-side via the `(channelTwitchId, ircId)` unique index so re-runs are free.
   */
  React.useEffect(() => {
    if (!enabled || !channelTwitchId) return;
    if (typeof window === "undefined") return;
    const storageKey = BACKFILL_STORAGE_KEY_PREFIX + channelTwitchId;
    try {
      const last = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(last) && Date.now() - last < BACKFILL_THROTTLE_MS) return;
    } catch {
      /* fall through and attempt anyway */
    }
    // Mark optimistically so a rapid remount doesn't double-fire while the network request is in flight.
    try {
      localStorage.setItem(storageKey, String(Date.now()));
    } catch {
      /* ignore */
    }
    fetch("/api/twitch/chat-backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelTwitchId }),
      cache: "no-store"
    })
      .then(async (r) => {
        if (!r.ok) {
          // Roll back the throttle marker so the next attempt actually runs.
          try {
            localStorage.removeItem(storageKey);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
      });
  }, [enabled, channelTwitchId]);

  /**
   * Background flush loop — POSTs the queued PRIVMSGs to the chat archive every 5s. Failure to
   * upload one batch is non-fatal: the rows go back on the queue and the next tick retries.
   *
   * We use `navigator.sendBeacon` on `pagehide` so the final batch makes it to the server even
   * if the user closes the tab — beacon survives unload where `fetch` would be cancelled.
   */
  React.useEffect(() => {
    if (!enabled || !channelTwitchId) return;

    const flush = async () => {
      const queue = archiveQueueRef.current;
      if (queue.length === 0) return;
      const batch = queue.splice(0, ARCHIVE_BATCH_CAP);
      try {
        const res = await fetch("/api/twitch/chat-archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelTwitchId, messages: batch }),
          keepalive: true,
          cache: "no-store"
        });
        if (!res.ok && res.status !== 401 && res.status !== 403) {
          // Transient: put the batch back at the head so the next tick retries them.
          archiveQueueRef.current = [...batch, ...archiveQueueRef.current];
        }
        // 401/403 = the caller lost access — silently drop, no point retrying forever.
      } catch {
        archiveQueueRef.current = [...batch, ...archiveQueueRef.current];
      }
    };

    const interval = window.setInterval(flush, ARCHIVE_FLUSH_INTERVAL_MS);

    const onPageHide = () => {
      const queue = archiveQueueRef.current;
      if (queue.length === 0) return;
      const batch = queue.splice(0, ARCHIVE_BATCH_CAP);
      try {
        const blob = new Blob([JSON.stringify({ channelTwitchId, messages: batch })], {
          type: "application/json"
        });
        navigator.sendBeacon?.("/api/twitch/chat-archive", blob);
      } catch {
        /* best-effort only */
      }
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onPageHide);
      // Best-effort final flush on unmount (channel change, dashboard nav, etc.).
      void flush();
    };
  }, [enabled, channelTwitchId]);

  React.useEffect(() => {
    if (!enabled || !channelTwitchId) {
      setStatus({ phase: "idle" });
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let backoffMs = RECONNECT_INITIAL_MS;

    const append = (m: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((p) => p.id === m.id)) return prev;
        const next = [...prev, m];
        return next.length > MESSAGES_CAP ? next.slice(next.length - MESSAGES_CAP) : next;
      });
    };

    const handleLine = (line: string) => {
      const msg = parseIrcLine(line);
      if (!msg) return;

      // Twitch keepalive — we must respond or the server drops us.
      if (msg.command === "PING") {
        socket?.send(`PONG :${msg.trailing || "tmi.twitch.tv"}`);
        return;
      }

      // 001 = RPL_WELCOME (authenticated). We're connected, JOIN already queued.
      if (msg.command === "001") return;

      // Our own JOIN is reflected back — that's the cue that the channel is live.
      if (msg.command === "JOIN" && msg.nick === credsRef.current?.userLogin) {
        setStatus({ phase: "live" });
        backoffMs = RECONNECT_INITIAL_MS;
        return;
      }

      // USERSTATE arrives right after JOIN (and after each PRIVMSG we send). It's our authoritative
      // source for our own display name, badges, and colour — we cache it for optimistic echoes.
      if (msg.command === "USERSTATE") {
        const t = msg.tags ?? {};
        selfStateRef.current = {
          displayName: t["display-name"] || credsRef.current?.userLogin || "you",
          // GLOBALUSERSTATE supplies `user-id`; USERSTATE does not, so keep whatever we had previously.
          userId: t["user-id"] || selfStateRef.current?.userId || "",
          color: t["color"] || DEFAULT_CHAT_COLOR,
          badges: t["badges"] || ""
        };
        return;
      }

      if (msg.command === "GLOBALUSERSTATE") {
        const t = msg.tags ?? {};
        selfStateRef.current = {
          displayName: t["display-name"] || credsRef.current?.userLogin || "you",
          userId: t["user-id"] || "",
          color: t["color"] || DEFAULT_CHAT_COLOR,
          badges: t["badges"] || ""
        };
        return;
      }

      if (msg.command === "PRIVMSG") {
        const t = msg.tags ?? {};
        const badges = t["badges"] || "";
        const id = t["id"] || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const tsRaw = Number(t["tmi-sent-ts"]);
        const displayName = t["display-name"] || msg.nick || "anon";
        const userId = t["user-id"] || "";
        const userLogin = (msg.nick || "").toLowerCase();
        const color = t["color"] || DEFAULT_CHAT_COLOR;
        const text = msg.trailing ?? "";
        const ts = Number.isFinite(tsRaw) && tsRaw > 0 ? tsRaw : Date.now();
        const isMod = t["mod"] === "1" || badges.includes("moderator/") || badges.includes("broadcaster/");
        const isSubscriber = t["subscriber"] === "1" || badges.includes("subscriber/");

        append({
          id,
          user: displayName,
          userId,
          userLogin,
          color,
          text,
          ts,
          badges,
          isMod,
          isSubscriber,
          self: false,
          deleted: false,
          deletedKind: null,
          deletedTimeoutSec: null
        });

        /**
         * Enqueue for the archive flush. Only IRC-confirmed messages (those with a real `id`
         * tag — Twitch always sends one for PRIVMSG) are uploaded; we never push our own
         * optimistic echoes here because they'd collide with any other moderator's clean
         * upload of the same message via the channel-scoped `(channelTwitchId, ircId)` unique
         * key.
         */
        if (t["id"] && userLogin && text) {
          archiveQueueRef.current.push({
            ircId: t["id"],
            userTwitchId: userId,
            userLogin,
            displayName,
            color,
            text,
            badges,
            ts,
            isMod,
            isSubscriber
          });
        }
        return;
      }

      /**
       * CLEARCHAT — either a channel-wide /clear (no trailing user) or a user-specific
       * timeout/ban. We do NOT remove rows from the visible chat: mods asked to keep the
       * context so they can investigate, with a "show message" affordance per row.
       *
       * `ban-duration` tag carries the timeout in seconds; absent = permanent ban.
       */
      if (msg.command === "CLEARCHAT") {
        const t = msg.tags ?? {};
        const banDuration = Number(t["ban-duration"]);
        const isTimeout = Number.isFinite(banDuration) && banDuration > 0;
        const targetUser = msg.trailing;

        if (!targetUser) {
          // Channel-wide /clear — mod-initiated wipe, treat as a ban-style soft-delete of every row.
          setMessages((prev) =>
            prev.map((m) =>
              m.deleted ? m : { ...m, deleted: true, deletedKind: "ban", deletedTimeoutSec: null }
            )
          );
          enqueueChannelClear();
        } else {
          const lower = targetUser.toLowerCase();
          setMessages((prev) =>
            prev.map((m) => {
              if (m.deleted) return m;
              if (m.userLogin !== lower && m.user.toLowerCase() !== lower) return m;
              return isTimeout
                ? { ...m, deleted: true, deletedKind: "timeout", deletedTimeoutSec: banDuration }
                : { ...m, deleted: true, deletedKind: "ban", deletedTimeoutSec: null };
            })
          );
          enqueueUserClear(lower);
        }
        return;
      }

      // Single message deletion (e.g. mod removes one line). Soft-delete with kind "message".
      if (msg.command === "CLEARMSG") {
        const targetId = msg.tags?.["target-msg-id"];
        if (!targetId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === targetId
              ? { ...m, deleted: true, deletedKind: "message", deletedTimeoutSec: null }
              : m
          )
        );
        enqueueSingleDelete(targetId);
        return;
      }

      // Server-pushed notices: auth failures, slow-mode, follower-only mode, etc.
      if (msg.command === "NOTICE") {
        const trailing = msg.trailing ?? "";
        if (trailing.toLowerCase().includes("authentication failed")) {
          setStatus({
            phase: "error",
            message: "Twitch chat authentication failed. Sign out and sign in again."
          });
          try {
            socket?.close();
          } catch {
            /* ignore */
          }
        }
        return;
      }
    };

    const open = async () => {
      if (cancelled) return;
      setStatus({ phase: "loading-credentials" });

      let creds: ChatCredentials;
      try {
        const r = await fetch(`/api/twitch/chat-credentials?channelTwitchId=${encodeURIComponent(channelTwitchId)}`, {
          cache: "no-store"
        });
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          setStatus({ phase: "error", message: body.error || `Credentials failed (HTTP ${r.status})` });
          // 401/403 won't get better on retry — back off harder.
          if (r.status === 401 || r.status === 403) return;
          scheduleReconnect();
          return;
        }
        creds = (await r.json()) as ChatCredentials;
        creds.channelLogin = sanitizeTwitchChannelLogin(creds.channelLogin);
        creds.userLogin = sanitizeTwitchChannelLogin(creds.userLogin);
      } catch (e) {
        setStatus({ phase: "error", message: (e as Error).message || "Network error" });
        scheduleReconnect();
        return;
      }
      if (cancelled) return;
      credsRef.current = creds;

      setStatus({ phase: "connecting" });
      let ws: WebSocket;
      try {
        ws = new WebSocket(IRC_URL);
      } catch (e) {
        setStatus({ phase: "error", message: (e as Error).message || "WebSocket open failed" });
        scheduleReconnect();
        return;
      }
      socket = ws;
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
        ws.send(`PASS oauth:${creds.accessToken}`);
        ws.send(`NICK ${creds.userLogin}`);
        ws.send(`JOIN #${creds.channelLogin}`);
        setStatus({ phase: "joining" });
      };

      ws.onmessage = (evt) => {
        const data = typeof evt.data === "string" ? evt.data : "";
        if (!data) return;
        for (const raw of data.split("\r\n")) {
          if (raw) handleLine(raw);
        }
      };

      ws.onclose = () => {
        if (socket === ws) socket = null;
        wsRef.current = null;
        if (cancelled) return;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // ws.onclose will follow; nothing to do here.
      };
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
      setStatus({ phase: "disconnected", nextAttemptMs: delay });
      reconnectTimer = window.setTimeout(open, delay);
    };

    open();

    return () => {
      cancelled = true;
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        socket = null;
      }
      wsRef.current = null;
      credsRef.current = null;
      setStatus({ phase: "idle" });
    };
  }, [enabled, channelTwitchId]);

  const send = React.useCallback((text: string): boolean => {
    const clean = sanitizeChatText(text);
    if (!clean) return false;
    const ws = wsRef.current;
    const creds = credsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !creds) return false;
    ws.send(`PRIVMSG #${creds.channelLogin} :${clean}`);

    // Optimistic echo — Twitch IRC suppresses self-PRIVMSGs.
    const self = selfStateRef.current ?? {
      displayName: creds.userLogin,
      userId: "",
      color: DEFAULT_CHAT_COLOR,
      badges: ""
    };
    setMessages((prev) => {
      const next: ChatMessage[] = [
        ...prev,
        {
          id: `self-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          user: self.displayName,
          userId: self.userId,
          userLogin: creds.userLogin.toLowerCase(),
          color: self.color,
          text: clean,
          ts: Date.now(),
          badges: self.badges,
          isMod: self.badges.includes("moderator/") || self.badges.includes("broadcaster/"),
          isSubscriber: self.badges.includes("subscriber/"),
          self: true,
          deleted: false,
          deletedKind: null,
          deletedTimeoutSec: null
        }
      ];
      return next.length > MESSAGES_CAP ? next.slice(next.length - MESSAGES_CAP) : next;
    });
    return true;
  }, []);

  return { status, messages, send };
}
