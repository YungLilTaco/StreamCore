"use client";

/**
 * StreamCoreHelper — in-browser bot engine.
 *
 * Architecture: a thin command-runner layered on top of the existing dashboard IRC singleton in
 * `useDashboardSession`. The master prompt called for a tmi.js client in a React context; the
 * codebase already owns a fully-authenticated Twitch IRC WebSocket via `useTwitchChat` (auth,
 * reconnect, message parsing, PRIVMSG send). Spinning up a parallel tmi.js connection in the
 * same tab would burn a second WebSocket against Twitch's per-user rate budget and double the
 * IRC traffic for zero functional gain — instead we consume the existing message stream and
 * share its `send`. The result is the same architecture the master prompt described (one
 * singleton client, exposed via context, processes chat events on the broadcaster channel),
 * with one fewer connection.
 *
 * Runs only while a tab containing this provider is open: the surrounding
 * `DashboardSessionProvider` (and therefore the IRC socket) is mounted only on
 * `/app/dashboard`. The bot configuration UI lives at `/app/streamcore-bot` but does not need
 * the engine to be active for editing — only the actual chat responses do.
 *
 * Song requests: built-in `prefix + sr` (e.g. `!sr`) plus Channel Points redemptions that match
 * Song Request settings are handled here via `/api/channel/song-request-automation` (Spotify +
 * queue + optional redemption fulfill). Built-in `prefix + volume` reads/sets Spotify output volume.
 *
 * Reply labelling: when `prefixRepliesAsHelper` is false (default), outgoing lines are prefixed with
 * `StreamCoreHelper · `; when true, lines are sent without that label (still your Twitch IRC session).
 *
 * Template variables supported in command responses:
 *   - ${user}              → display name of the chatter who triggered the command
 *   - ${target}            → first argument after the trigger (with optional leading `@` stripped);
 *                            falls back to ${user} when no argument is supplied
 *   - ${streamer}          → display name of the broadcaster the bot is running on
 *   - ${random:min-max}    → uniformly-random integer in [min, max] (inclusive)
 */

import * as React from "react";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import {
  useMaybeDashboardSession
} from "@/components/app/DashboardSessionProvider";
import { isCpRedemptionAlreadyQueued, markCpRedemptionQueued } from "@/lib/song-request-redemption-dedupe";

type BotCommand = {
  id: string;
  trigger: string;
  response: string;
  enabled: boolean;
  cooldownSec: number;
  modOnly: boolean;
};

type BotSettings = {
  enabled: boolean;
  prefix: string;
  prefixRepliesAsHelper: boolean;
  greetingEnabled: boolean;
  greetingMessage: string | null;
};

export type BotEngineStatus = {
  /** True when at least one tab is hosting the engine (this provider mounted) AND chat is live. */
  running: boolean;
  /** True if the user has the bot master-toggle off, even though the engine is loaded. */
  configured: boolean;
  /** Number of commands currently loaded (enabled + disabled). */
  commandCount: number;
  /** Number of times a command pattern matched a chat message in this session. */
  matched: number;
  /** Number of `PRIVMSG`s the engine pushed to chat in this session. */
  sent: number;
  /** Most recent trigger that ran, or null. */
  lastTrigger: string | null;
};

const Ctx = React.createContext<BotEngineStatus | null>(null);

/**
 * Read live engine status from React (e.g. to surface "online / X commands / Y replies" on the
 * StreamCore Bot dashboard page). Returns null when no provider is mounted — callers should
 * treat that as "engine isn't running in any tab".
 */
export function useBotEngineStatus(): BotEngineStatus | null {
  return React.useContext(Ctx);
}

/**
 * Substitute the supported template variables in a command response template.
 *
 * Each variable maps to a single replacement pass over the string. Replacement is intentionally
 * literal — we do NOT recurse into the substituted text, so a chatter named "${streamer}" can't
 * trick the engine into expanding ${streamer} a second time. Random ranges accept either order
 * (the `min` and `max` arguments are sorted internally) and clamp to integer math.
 */
function substituteVariables(
  template: string,
  ctx: { user: string; target: string; streamer: string }
): string {
  return template
    .replace(/\$\{user\}/g, ctx.user)
    .replace(/\$\{target\}/g, ctx.target)
    .replace(/\$\{streamer\}/g, ctx.streamer)
    .replace(/\$\{random:(-?\d+)-(-?\d+)\}/g, (_match, loRaw: string, hiRaw: string) => {
      const a = Number(loRaw);
      const b = Number(hiRaw);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return "0";
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
    });
}

/** Pull `<trigger> <rest...>` out of a chat message body, after the configured prefix has been stripped. */
function splitTriggerAndArgs(body: string): { trigger: string; argsTail: string } {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { trigger: "", argsTail: "" };
  const space = trimmed.search(/\s/);
  if (space === -1) return { trigger: trimmed.toLowerCase(), argsTail: "" };
  return { trigger: trimmed.slice(0, space).toLowerCase(), argsTail: trimmed.slice(space + 1).trim() };
}

/** Parse `50`, `50%`, fullwidth ％, NBSP — anything else returns null. */
function parseVolumePercentFromArgsTail(raw: string): number | null {
  let t = raw.replace(/[\u200b-\u200d\ufeff\u2060]/g, "");
  t = t.replace(/\u00a0/g, " ").replace(/％/g, "%").replace(/﹪/g, "%").trim();
  const m = /^(\d{1,3})\s*%?\s*$/u.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function formatOutgoingReply(text: string, settings: BotSettings): string {
  const t = text.trim();
  if (!t) return t;
  /**
   * `prefixRepliesAsHelper === false` (default) → prefix with StreamCoreHelper so chat can tell
   * bot output apart. `true` → raw line (still sent via your Twitch IRC session).
   */
  if (!settings.prefixRepliesAsHelper) {
    return `StreamCoreHelper · ${t}`;
  }
  return t;
}

function buildHelpReply(prefix: string, catalog: BotCommand[]): string {
  const custom = catalog.filter((c) => c.enabled).map((c) => c.trigger.toLowerCase());
  const builtins = ["commands", "help", "sr", "volume"];
  const triggers = [...new Set([...builtins, ...custom])].sort();
  const list = triggers.map((t) => `${prefix}${t}`).join(", ");
  return `Commands: ${list}`;
}

type SongRequestConfigDTO = {
  channelTwitchId?: string;
  channelPointsRewardId: string | null;
  allowEveryone: boolean;
  subsOnly: boolean;
  vipsOnly: boolean;
  modsOnly: boolean;
  volumeAllowEveryone: boolean;
  volumeSubsOnly: boolean;
  volumeVipsOnly: boolean;
  volumeModsOnly: boolean;
};

function songRequestRoleAllowed(
  cfg: { allowEveryone: boolean; subsOnly: boolean; vipsOnly: boolean; modsOnly: boolean },
  flags: { isSubscriber: boolean; isVip: boolean; isMod: boolean }
): boolean {
  if (cfg.allowEveryone) return true;
  return (
    (!cfg.subsOnly || flags.isSubscriber) &&
    (!cfg.vipsOnly || flags.isVip) &&
    (!cfg.modsOnly || flags.isMod)
  );
}

export function BotEngineProvider({ children }: { children: React.ReactNode }) {
  const { channelTwitchId, channels, ready } = useSelectedChannel();
  /**
   * The dashboard session provider is the source for `chatMessages` + `chatSend`. We use the
   * `useMaybe…` variant so this component can be safely mounted higher in the tree (it'll just
   * stay idle) — production usage mounts it inside `DashboardSessionProvider` on the dashboard
   * route, where the hook returns a value.
   */
  const session = useMaybeDashboardSession();
  const eventSubLiveEvents = session?.eventSubLiveEvents ?? [];

  const [commands, setCommands] = React.useState<BotCommand[]>([]);
  const [settings, setSettings] = React.useState<BotSettings | null>(null);
  const [songReqCfg, setSongReqCfg] = React.useState<SongRequestConfigDTO | null>(null);
  const [stats, setStats] = React.useState<{ matched: number; sent: number; lastTrigger: string | null }>({
    matched: 0,
    sent: 0,
    lastTrigger: null
  });

  /**
   * IDs of chat messages we've already inspected. RGL's chat state pushes new entries
   * append-only with stable IDs, so a Set is enough — we don't need to track ordering.
   * Capped at MAX_PROCESSED_IDS to keep memory bounded across multi-hour sessions.
   */
  const processedRef = React.useRef<Set<string>>(new Set());
  const MAX_PROCESSED_IDS = 1000;

  /** `trigger → epoch ms when the cooldown clears`. */
  const cooldownsRef = React.useRef<Map<string, number>>(new Map());
  /** True after the greeting has fired once for the current channel. Reset on channel change. */
  const greetedRef = React.useRef(false);

  const processedSongEventIdsRef = React.useRef<Set<string>>(new Set());

  // Reset per-channel state when the broadcaster changes.
  React.useEffect(() => {
    processedRef.current = new Set();
    cooldownsRef.current = new Map();
    greetedRef.current = false;
    processedSongEventIdsRef.current = new Set();
    setStats({ matched: 0, sent: 0, lastTrigger: null });
  }, [channelTwitchId]);

  /**
   * Load (or refresh) commands + settings whenever the channel changes.
   *
   * Both endpoints are 403 for any user that doesn't own the channel — that's the source of
   * truth, and we just treat a non-200 response as "no commands, bot disabled". Polling on a
   * small cadence is intentional: a co-streamer might edit the catalog in another tab and we
   * want those changes live on the broadcaster's bot tab without a refresh.
   */
  React.useEffect(() => {
    if (!ready || !channelTwitchId) {
      setCommands([]);
      setSettings(null);
      setSongReqCfg(null);
      return;
    }

    let cancelled = false;
    const ch = channelTwitchId;

    async function fetchOnce() {
      try {
        const [cmdsRes, settingsRes, songCfgRes] = await Promise.all([
          fetch(`/api/channel/bot-commands?channelTwitchId=${encodeURIComponent(ch)}`, {
            cache: "no-store"
          }),
          fetch(`/api/channel/bot-settings?channelTwitchId=${encodeURIComponent(ch)}`, {
            cache: "no-store"
          }),
          fetch(`/api/channel/song-request-config?channelTwitchId=${encodeURIComponent(ch)}`, {
            cache: "no-store"
          })
        ]);
        if (cancelled) return;
        if (cmdsRes.ok) {
          const json = (await cmdsRes.json()) as { commands: BotCommand[] };
          setCommands(json.commands ?? []);
        } else {
          setCommands([]);
        }
        if (settingsRes.ok) {
          const json = (await settingsRes.json()) as { settings: BotSettings };
          setSettings(json.settings ?? null);
        } else {
          setSettings(null);
        }
        if (songCfgRes.ok) {
          const j = (await songCfgRes.json()) as { config: SongRequestConfigDTO | null };
          const base = j.config ?? {
            channelTwitchId: ch,
            channelPointsRewardId: null,
            allowEveryone: true,
            subsOnly: false,
            vipsOnly: false,
            modsOnly: false,
            volumeAllowEveryone: true,
            volumeSubsOnly: false,
            volumeVipsOnly: false,
            volumeModsOnly: false
          };
          setSongReqCfg({
            ...base,
            volumeAllowEveryone: base.volumeAllowEveryone ?? true,
            volumeSubsOnly: base.volumeSubsOnly ?? false,
            volumeVipsOnly: base.volumeVipsOnly ?? false,
            volumeModsOnly: base.volumeModsOnly ?? false
          });
        } else {
          setSongReqCfg(null);
        }
      } catch {
        if (!cancelled) {
          setCommands([]);
          setSettings(null);
          setSongReqCfg(null);
        }
      }
    }

    void fetchOnce();
    /** 30s refresh keeps the bot in sync with edits from another tab without hammering the API. */
    const t = window.setInterval(fetchOnce, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [ready, channelTwitchId]);

  // Pre-compute a fast `trigger → command` lookup so the per-message handler is O(1).
  const commandIndex = React.useMemo(() => {
    const m = new Map<string, BotCommand>();
    for (const c of commands) {
      if (c.enabled) m.set(c.trigger.toLowerCase(), c);
    }
    return m;
  }, [commands]);

  // Resolve the streamer display name once per channel from the selected-channel context.
  const streamerDisplayName = React.useMemo(() => {
    const match = channels.find((c) => c.channelTwitchId === channelTwitchId);
    return match?.channelDisplayName ?? "streamer";
  }, [channels, channelTwitchId]);

  /**
   * Main chat → bot reducer.
   *
   * Triggered every time `chatMessages` changes. We walk the entire list and skip anything we've
   * already inspected (tracked by id in `processedRef`). For the rare case where messages are
   * pruned from the chat dock's MESSAGES_CAP, we still process the tail-end correctly because
   * the array is append-only within its lifetime; the Set never errs in the false-positive
   * direction.
   */
  React.useEffect(() => {
    if (!session || !settings?.enabled) return;
    const msgs = session.chatMessages;
    if (msgs.length === 0) return;

    const prefix = settings.prefix;
    const processed = processedRef.current;
    const cooldowns = cooldownsRef.current;
    const now = Date.now();
    let localMatched = 0;
    let localSent = 0;
    let lastTrigger: string | null = null;

    for (const m of msgs) {
      if (processed.has(m.id)) continue;
      processed.add(m.id);

      // Skip self-echoes (our own optimistic PRIVMSG insertions) and deleted rows.
      if (m.self || m.deleted) continue;
      if (!m.text || !m.text.startsWith(prefix)) continue;

      const { trigger, argsTail } = splitTriggerAndArgs(m.text.slice(prefix.length));
      if (!trigger) continue;

      if (trigger === "sr") {
        if (!channelTwitchId) continue;
        const srKey = "__sr_builtin";
        const nextSr = cooldowns.get(srKey) ?? 0;
        if (now < nextSr) continue;
        if (!songReqCfg) continue;
        const badges = m.badges || "";
        const roleFlags = { isSubscriber: m.isSubscriber, isVip: badges.includes("vip/"), isMod: m.isMod };
        if (!songRequestRoleAllowed(songReqCfg, roleFlags)) continue;

        const query = argsTail.trim();
        const replySr = (t: string) => {
          if (session.chatSend(formatOutgoingReply(t, settings))) {
            setStats((s) => ({ ...s, sent: s.sent + 1 }));
          }
        };

        if (!query) {
          replySr(`@${m.userLogin} Usage: ${prefix}sr <Spotify link or search text>`);
          localMatched += 1;
          lastTrigger = "sr";
          cooldowns.set(srKey, now + 4000);
          continue;
        }

        localMatched += 1;
        lastTrigger = "sr";
        cooldowns.set(srKey, now + 5000);

        void (async () => {
          try {
            const res = await fetch("/api/channel/song-request-automation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                channelTwitchId,
                requestedByLogin: m.userLogin,
                query,
                isSubscriber: roleFlags.isSubscriber,
                isVip: roleFlags.isVip,
                isMod: roleFlags.isMod
              })
            });
            const j = (await res.json().catch(() => null)) as {
              message?: string;
              item?: { title: string; artist: string };
              spotifyQueued?: boolean;
            } | null;
            if (!res.ok) {
              replySr(`@${m.userLogin} ${typeof j?.message === "string" ? j.message : "Song request failed."}`);
              return;
            }
            const item = j?.item;
            const qd = j?.spotifyQueued;
            const tail =
              qd === false
                ? " — saved to your request list; open Spotify on a device to queue playback."
                : "";
            if (item) {
              replySr(`@${m.userLogin} Queued: ${item.title} — ${item.artist}${tail}`);
            } else {
              replySr(`@${m.userLogin} Queued.${tail}`);
            }
          } catch {
            replySr(`@${m.userLogin} Song request failed (network).`);
          }
        })();
        continue;
      }

      if (trigger === "volume") {
        if (!channelTwitchId) continue;
        if (!songReqCfg) continue;

        const volKey = "__volume_builtin";
        const nextVol = cooldowns.get(volKey) ?? 0;
        if (now < nextVol) continue;

        const badges = m.badges || "";
        const roleFlags = { isSubscriber: m.isSubscriber, isVip: badges.includes("vip/"), isMod: m.isMod };
        if (
          !songRequestRoleAllowed(
            {
              allowEveryone: songReqCfg.volumeAllowEveryone,
              subsOnly: songReqCfg.volumeSubsOnly,
              vipsOnly: songReqCfg.volumeVipsOnly,
              modsOnly: songReqCfg.volumeModsOnly
            },
            roleFlags
          )
        )
          continue;

        const volReply = (t: string) => {
          if (session.chatSend(formatOutgoingReply(t, settings))) {
            setStats((s) => ({ ...s, sent: s.sent + 1 }));
          }
        };

        const tail = argsTail.trim();
        const volPct = tail.length ? parseVolumePercentFromArgsTail(tail) : null;

        if (!tail) {
          localMatched += 1;
          lastTrigger = "volume";
          cooldowns.set(volKey, now + 2500);
          void (async () => {
            try {
              const res = await fetch("/api/spotify/player-volume", { cache: "no-store" });
              const j = (await res.json().catch(() => null)) as {
                volumePercent?: number | null;
                code?: string;
                message?: string;
              } | null;
              if (!res.ok) {
                volReply(
                  `@${m.userLogin} ${typeof j?.message === "string" ? j.message : "Could not read Spotify volume."}`
                );
                return;
              }
              if (typeof j?.volumePercent !== "number") {
                volReply(
                  `@${m.userLogin} ${
                    j?.code === "no_active_device"
                      ? "No active Spotify device — open Spotify and try again."
                      : "Volume unavailable."
                  }`
                );
                return;
              }
              volReply(`@${m.userLogin} Spotify volume is at ${j.volumePercent}%.`);
            } catch {
              volReply(`@${m.userLogin} Could not read Spotify volume (network).`);
            }
          })();
          continue;
        }

        if (volPct === null) {
          volReply(`@${m.userLogin} Usage: ${prefix}volume or ${prefix}volume <0-100>%`);
          localMatched += 1;
          lastTrigger = "volume";
          cooldowns.set(volKey, now + 1500);
          continue;
        }

        const n = volPct;

        localMatched += 1;
        lastTrigger = "volume";
        cooldowns.set(volKey, now + 2500);
        void (async () => {
          try {
            const res = await fetch(`/api/spotify/playback?action=volume&value=${n}`, { method: "POST" });
            const j = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
            if (!res.ok) {
              const msg =
                res.status === 409 && j?.code === "no_active_device"
                  ? "No active Spotify device — open Spotify and try again."
                  : typeof j?.message === "string"
                    ? j.message
                    : `Spotify ${res.status}`;
              volReply(`@${m.userLogin} ${msg}`);
              return;
            }
            volReply(`@${m.userLogin} Spotify volume set to ${n}%.`);
          } catch {
            volReply(`@${m.userLogin} Volume change failed (network).`);
          }
        })();
        continue;
      }

      const cmd = commandIndex.get(trigger);
      const builtinHelp = trigger === "help" || trigger === "commands";
      if (!cmd && !builtinHelp) continue;

      const cooldownKey = cmd ? cmd.trigger : "__builtin_help";
      const cooldownMs = cmd ? cmd.cooldownSec * 1000 : 5000;

      if (cmd?.modOnly && !m.isMod) continue;

      const nextOk = cooldowns.get(cooldownKey) ?? 0;
      if (now < nextOk) continue;

      const firstArg = argsTail.split(/\s+/, 1)[0] ?? "";
      const target = firstArg.replace(/^@/, "").trim() || m.user;

      const rawReply = cmd
        ? substituteVariables(cmd.response, {
            user: m.user,
            target,
            streamer: streamerDisplayName
          })
        : buildHelpReply(prefix, commands);

      const reply = formatOutgoingReply(rawReply, settings);
      const sentOk = session.chatSend(reply);
      localMatched += 1;
      if (sentOk) {
        localSent += 1;
        lastTrigger = cmd?.trigger ?? trigger;
        cooldowns.set(cooldownKey, now + cooldownMs);
      }
    }

    // Bound the processed-id set so we don't grow it indefinitely across a long stream.
    if (processed.size > MAX_PROCESSED_IDS) {
      const trimmed = Array.from(processed).slice(-MAX_PROCESSED_IDS);
      processedRef.current = new Set(trimmed);
    }

    if (localMatched > 0 || localSent > 0) {
      setStats((s) => ({
        matched: s.matched + localMatched,
        sent: s.sent + localSent,
        lastTrigger: lastTrigger ?? s.lastTrigger
      }));
    }
  }, [session, commandIndex, settings, streamerDisplayName, commands, songReqCfg, channelTwitchId]);

  /**
   * Channel Points song-request reward (EventSub) — runs while the live dashboard is open even if
   * the Activity Feed dock is hidden (EventSub is lifted to `DashboardSessionProvider`).
   */
  React.useEffect(() => {
    if (!session || !settings?.enabled || !channelTwitchId || !songReqCfg?.channelPointsRewardId) return;

    const rewardId = songReqCfg.channelPointsRewardId;
    const processed = processedSongEventIdsRef.current;

    for (const ev of eventSubLiveEvents) {
      if (ev.kind !== "channel_points_redeem") continue;
      const cp = ev.channelPointsRedemption;
      if (!cp || cp.rewardId !== rewardId) continue;
      if (processed.has(ev.id)) continue;

      if (isCpRedemptionAlreadyQueued(channelTwitchId, cp.redemptionId)) {
        processed.add(ev.id);
        continue;
      }

      processed.add(ev.id);

      const query = cp.userInput?.trim() ?? "";
      if (!query) continue;

      const login = (ev.actorLogin ?? "viewer").toLowerCase();

      void (async () => {
        try {
          const res = await fetch("/api/channel/song-request-automation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelTwitchId,
              requestedByLogin: login,
              query,
              redemption: { rewardId: cp.rewardId, redemptionId: cp.redemptionId }
            })
          });
          const j = (await res.json().catch(() => null)) as {
            message?: string;
            item?: { title: string; artist: string };
            spotifyQueued?: boolean;
          } | null;
          const replySr = (t: string) => {
            if (session.chatSend(formatOutgoingReply(t, settings))) {
              setStats((s) => ({ ...s, sent: s.sent + 1 }));
            }
          };
          if (!res.ok) {
            replySr(`@${login} ${typeof j?.message === "string" ? j.message : "Song request failed."}`);
            processed.delete(ev.id);
            return;
          }
          markCpRedemptionQueued(channelTwitchId, cp.redemptionId);
          const item = j?.item;
          const qd = j?.spotifyQueued;
          const tail =
            qd === false
              ? " — open Spotify on a device to add to the playback queue."
              : "";
          if (item) {
            replySr(`@${login} Queued: ${item.title} — ${item.artist}${tail}`);
          }
        } catch {
          processed.delete(ev.id);
          /* ignore */
        }
      })();
    }
  }, [eventSubLiveEvents, session, settings, channelTwitchId, songReqCfg]);

  /**
   * One-shot greeting on first transition into the `live` chat state per channel.
   *
   * We deliberately do NOT re-fire on subsequent reconnects: streamers reload the dashboard
   * frequently while live, and shouting "Hey chat!" every time would be obnoxious.
   * `greetedRef` is the latch and resets only when the channel changes.
   */
  React.useEffect(() => {
    if (!session || !settings?.enabled) return;
    if (!settings.greetingEnabled || !settings.greetingMessage) return;
    if (session.chatStatus.phase !== "live") return;
    if (greetedRef.current) return;
    greetedRef.current = true;
    const text = substituteVariables(settings.greetingMessage, {
      user: "",
      target: "",
      streamer: streamerDisplayName
    });
    const out = formatOutgoingReply(text, settings);
    if (out.trim().length) {
      const ok = session.chatSend(out);
      if (ok) setStats((s) => ({ ...s, sent: s.sent + 1, lastTrigger: "greeting" }));
    }
  }, [session, settings, streamerDisplayName]);

  const value: BotEngineStatus = React.useMemo(
    () => ({
      running: Boolean(session && settings?.enabled && session.chatStatus.phase === "live"),
      configured: Boolean(settings?.enabled),
      commandCount: commands.length,
      matched: stats.matched,
      sent: stats.sent,
      lastTrigger: stats.lastTrigger
    }),
    [session, settings, commands.length, stats]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
