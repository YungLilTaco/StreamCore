"use client";

import * as React from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { setOauthLinkIntent } from "@/lib/oauth-link-intent";
import { Loader2, Music2, Plus, Trash2, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import { cn } from "@/components/lib/cn";

type QueueItemDTO = {
  id: string;
  title: string;
  artist: string;
  spotifyUri: string;
  requestedByLogin: string;
  createdAt: string;
};

type ConfigDTO = {
  channelTwitchId: string;
  channelPointsRewardId: string | null;
  allowEveryone: boolean;
  subsOnly: boolean;
  vipsOnly: boolean;
  modsOnly: boolean;
  volumeAllowEveryone: boolean;
  volumeSubsOnly: boolean;
  volumeVipsOnly: boolean;
  volumeModsOnly: boolean;
  updatedAt: string;
} | null;

export function SongRequestsClient() {
  const { channelTwitchId, ready } = useSelectedChannel();

  if (!ready) {
    return <div className="text-sm text-white/65">Resolving channel…</div>;
  }
  if (!channelTwitchId) {
    return (
      <div className="text-sm text-white/65">
        Select your channel from the header menu to manage song requests.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SpotifyNowPlayingSection />
      <QueueSection channelTwitchId={channelTwitchId} />
      <PermissionsSection channelTwitchId={channelTwitchId} />
      <RewardTriggerSection channelTwitchId={channelTwitchId} />
    </div>
  );
}

function SpotifyNowPlayingSection() {
  const linkClass =
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white/5 px-4 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/8 hover:ring-white/15";

  return (
    <section className="rounded-xl border border-white/10 bg-black/30 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Music2 className="h-4 w-4 shrink-0 text-primary" />
            Spotify &amp; now playing
          </h2>
          <p className="mt-2 max-w-xl text-sm text-white/60">
            Link Spotify for playback controls and overlays. Use the same redirect host you use in the browser (see
            login page hints if <code className="font-mono text-white/75">Configuration</code> errors appear).
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            className="shadow-glow-purple"
            onClick={() => {
              setOauthLinkIntent("spotify", "/app/song-requests");
              void signIn("spotify", { callbackUrl: "/app/song-requests" });
            }}
          >
            Link / Re-link Spotify
          </Button>
          <Link href="/app/settings" className={linkClass}>
            Settings
          </Link>
          <Link href="/app/now-playing-animation" target="_blank" rel="noopener noreferrer" className={linkClass}>
            <ExternalLink className="h-4 w-4" />
            Now playing (app)
          </Link>
          <Link href="/overlay/now-playing" target="_blank" rel="noopener noreferrer" className={linkClass}>
            <ExternalLink className="h-4 w-4" />
            OBS overlay
          </Link>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- *
 * Queue management                                                            *
 * -------------------------------------------------------------------------- */

function QueueSection({ channelTwitchId }: { channelTwitchId: string }) {
  const [queue, setQueue] = React.useState<QueueItemDTO[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState({ title: "", artist: "", spotifyUri: "" });
  const [adding, setAdding] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/channel/song-request-queue?channelTwitchId=${encodeURIComponent(channelTwitchId)}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message ?? `Load failed (${res.status})`);
      setQueue(json.queue as QueueItemDTO[]);
      setError(null);
    } catch (e) {
      setError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [channelTwitchId]);

  React.useEffect(() => {
    void refresh();
    /**
     * Poll every 8s while the page is open. Cheap (1 small SELECT, no auth round-trips after
     * the session is cached) and keeps the dashboard view convergent with chat-driven adds
     * coming from the bot runtime in the next slice.
     */
    const t = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function add() {
    const title = draft.title.trim();
    const artist = draft.artist.trim();
    const spotifyUri = draft.spotifyUri.trim();
    if (!title || !artist || !spotifyUri) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/channel/song-request-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ channelTwitchId, title, artist, spotifyUri })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message ?? `Add failed (${res.status})`);
      setDraft({ title: "", artist: "", spotifyUri: "" });
      await refresh();
    } catch (e) {
      setError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Add failed.");
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    try {
      const url = `/api/channel/song-request-queue?channelTwitchId=${encodeURIComponent(channelTwitchId)}&id=${encodeURIComponent(id)}`;
      const res = await fetch(url, { method: "DELETE", cache: "no-store" });
      if (!res.ok) throw new Error(`Remove failed (${res.status})`);
      await refresh();
    } catch (e) {
      setError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Remove failed.");
    }
  }

  async function clearAll() {
    if (!confirm("Clear the entire song-request queue?")) return;
    try {
      const url = `/api/channel/song-request-queue?channelTwitchId=${encodeURIComponent(channelTwitchId)}&all=1`;
      const res = await fetch(url, { method: "DELETE", cache: "no-store" });
      if (!res.ok) throw new Error(`Clear failed (${res.status})`);
      await refresh();
    } catch (e) {
      setError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Clear failed.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Queue</h2>
          <p className="mt-1 text-xs text-white/55">
            Live song-request queue. Manual adds drop in at the bottom.{" "}
            <span className="text-white/70">
              <span className="font-mono text-primary/80">!sr</span> and Channel Points triggers run from the{" "}
              <strong className="text-white/80">live dashboard</strong> tab (StreamCoreHelper + Spotify must be connected there).
            </span>
          </p>
        </div>
        <Button
          variant="ghost"
          className="text-white/70 hover:text-rose-200"
          disabled={!queue?.length}
          onClick={() => void clearAll()}
        >
          <Trash2 className="h-4 w-4" />
          Clear all
        </Button>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/30 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
          <Input
            placeholder="Title"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            maxLength={240}
          />
          <Input
            placeholder="Artist"
            value={draft.artist}
            onChange={(e) => setDraft((d) => ({ ...d, artist: e.target.value }))}
            maxLength={240}
          />
          <Input
            placeholder="Spotify URI or track URL"
            value={draft.spotifyUri}
            onChange={(e) => setDraft((d) => ({ ...d, spotifyUri: e.target.value }))}
            maxLength={240}
          />
          <Button variant="primary" disabled={adding} onClick={() => void add()}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      {error ? <div className="text-xs text-rose-300">{error}</div> : null}

      {loading && queue === null ? (
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
        </div>
      ) : (queue?.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/55">
          Queue is empty.
        </div>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
          {queue!.map((q, i) => (
            <li
              key={q.id}
              className="flex items-center gap-3 bg-black/20 px-3 py-2 text-sm transition hover:bg-white/[0.03]"
            >
              <span className="w-8 text-xs tabular-nums text-white/45">{String(i + 1).padStart(2, "0")}</span>
              <Music2 className="h-4 w-4 shrink-0 text-primary/80" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-white">{q.title}</span>
                <span className="block truncate text-xs text-white/55">
                  {q.artist} · requested by{" "}
                  <span className="text-white/75">{q.requestedByLogin}</span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => void remove(q.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-white/60 transition hover:bg-rose-500/15 hover:text-rose-200"
                aria-label={`Remove ${q.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- *
 * Permissions (who can request)                                               *
 * -------------------------------------------------------------------------- */

function PermissionsSection({ channelTwitchId }: { channelTwitchId: string }) {
  const [cfg, setCfg] = React.useState<ConfigDTO>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/channel/song-request-config?channelTwitchId=${encodeURIComponent(channelTwitchId)}`, {
      cache: "no-store"
    })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((j: { config: ConfigDTO } | null) => {
        if (cancelled) return;
        const raw = j?.config;
        setCfg(
          raw
            ? {
                ...raw,
                volumeAllowEveryone: raw.volumeAllowEveryone ?? true,
                volumeSubsOnly: raw.volumeSubsOnly ?? false,
                volumeVipsOnly: raw.volumeVipsOnly ?? false,
                volumeModsOnly: raw.volumeModsOnly ?? false
              }
            : {
                channelTwitchId,
                channelPointsRewardId: null,
                allowEveryone: true,
                subsOnly: false,
                vipsOnly: false,
                modsOnly: false,
                volumeAllowEveryone: true,
                volumeSubsOnly: false,
                volumeVipsOnly: false,
                volumeModsOnly: false,
                updatedAt: new Date(0).toISOString()
              }
        );
        setDirty(false);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load permissions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelTwitchId]);

  function patch(next: Partial<NonNullable<ConfigDTO>>) {
    setCfg((cur) => (cur ? { ...cur, ...next } : cur));
    setDirty(true);
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/channel/song-request-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          channelTwitchId,
          allowEveryone: cfg.allowEveryone,
          subsOnly: cfg.subsOnly,
          vipsOnly: cfg.vipsOnly,
          modsOnly: cfg.modsOnly,
          volumeAllowEveryone: cfg.volumeAllowEveryone,
          volumeSubsOnly: cfg.volumeSubsOnly,
          volumeVipsOnly: cfg.volumeVipsOnly,
          volumeModsOnly: cfg.volumeModsOnly
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.message ?? `Save failed (${res.status})`);
      }
      setDirty(false);
    } catch (e) {
      setError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Who can request songs</h2>
        <p className="mt-1 text-xs text-white/55">
          Applies to <span className="font-mono text-primary/80">!sr</span> and your configured Channel Points reward.
          Viewers must satisfy <em>all</em> checked criteria when “Allow everyone” is off.
        </p>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : cfg ? (
        <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-4">
          <Checkbox
            label="Allow everyone (default)"
            checked={cfg.allowEveryone}
            onChange={(v) => patch({ allowEveryone: v })}
          />
          <Checkbox
            label="Subscribers only"
            checked={cfg.subsOnly}
            onChange={(v) => patch({ subsOnly: v })}
          />
          <Checkbox label="VIPs only" checked={cfg.vipsOnly} onChange={(v) => patch({ vipsOnly: v })} />
          <Checkbox label="Moderators only" checked={cfg.modsOnly} onChange={(v) => patch({ modsOnly: v })} />

          <div className="border-t border-white/10 pt-4">
            <h3 className="text-sm font-semibold text-white">Who can use !volume</h3>
            <p className="mt-1 text-xs text-white/55">
              Same rules as above, but only for the built-in Spotify volume command (read/set playback volume). Shown on
              the StreamCore Bot page under built-ins.
            </p>
            <div className="mt-3 space-y-2">
              <Checkbox
                label="Allow everyone (default)"
                checked={cfg.volumeAllowEveryone}
                onChange={(v) => patch({ volumeAllowEveryone: v })}
              />
              <Checkbox
                label="Subscribers only"
                checked={cfg.volumeSubsOnly}
                onChange={(v) => patch({ volumeSubsOnly: v })}
              />
              <Checkbox
                label="VIPs only"
                checked={cfg.volumeVipsOnly}
                onChange={(v) => patch({ volumeVipsOnly: v })}
              />
              <Checkbox
                label="Moderators only"
                checked={cfg.volumeModsOnly}
                onChange={(v) => patch({ volumeModsOnly: v })}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            {error ? <span className="text-xs text-rose-300">{error}</span> : null}
            <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "Saving…" : dirty ? "Save" : "Saved"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- *
 * Channel Points reward ID                                                    *
 * -------------------------------------------------------------------------- */

function RewardTriggerSection({ channelTwitchId }: { channelTwitchId: string }) {
  const [rewardId, setRewardId] = React.useState("");
  const [rewards, setRewards] = React.useState<{ id: string; title: string; cost: number }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [rewardsError, setRewardsError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/channel/song-request-config?channelTwitchId=${encodeURIComponent(channelTwitchId)}`, {
        cache: "no-store"
      }).then(async (r) => (r.ok ? r.json() : null)),
      fetch(`/api/twitch/channel-custom-rewards?channelTwitchId=${encodeURIComponent(channelTwitchId)}`, {
        cache: "no-store"
      }).then(async (r) => (r.ok ? r.json() : null))
    ])
      .then(([cfgJson, rwJson]: [{ config: ConfigDTO } | null, { rewards?: { id: string; title: string; cost: number }[]; message?: string } | null]) => {
        if (cancelled) return;
        const id = cfgJson?.config?.channelPointsRewardId ?? "";
        setRewardId(id);
        if (rwJson && Array.isArray(rwJson.rewards)) {
          setRewards(rwJson.rewards);
          setRewardsError(null);
        } else {
          setRewards([]);
          setRewardsError(
            typeof rwJson?.message === "string"
              ? rwJson.message
              : "Could not load rewards (needs channel:read:redemptions on your Twitch token)."
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRewardId("");
          setRewards([]);
          setRewardsError("Could not load rewards.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelTwitchId]);

  async function save(nextId?: string | null) {
    const id = nextId !== undefined ? nextId : rewardId.trim() || null;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/channel/song-request-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          channelTwitchId,
          channelPointsRewardId: id
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.message ?? `Save failed (${res.status})`);
      }
      if (typeof nextId === "string") setRewardId(nextId);
      setMessage("Saved.");
    } catch (e) {
      setMessage(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">!sr trigger reward</h2>
        <p className="mt-1 text-xs text-white/55">
          Choose which custom Channel Points reward adds a song to the queue when viewers redeem it.
          Requires <span className="font-mono text-white/70">channel:read:redemptions</span> on your Twitch connection.
          In Twitch Creator Dashboard, turn on <strong className="text-white/75">Require viewer to enter text</strong> on
          this reward so viewers can paste a Spotify link or search text (Twitch only delivers that text to the bot over
          EventSub).
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="song-reward-select" className="text-xs font-medium uppercase tracking-wide text-white/55">
            Reward
          </label>
          <select
            id="song-reward-select"
            className={cn(
              "mt-1.5 flex h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm text-white",
              "outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
            )}
            disabled={loading || rewards.length === 0}
            value={rewardId}
            onChange={(e) => {
              const v = e.target.value;
              setRewardId(v);
              void save(v || null);
            }}
          >
            <option value="">— None (disabled) —</option>
            {rewards.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} ({r.cost} pts)
              </option>
            ))}
          </select>
          {rewardsError ? (
            <p className="mt-2 text-xs text-amber-200/90">{rewardsError}</p>
          ) : null}
        </div>
        <Button variant="secondary" disabled={saving || loading} onClick={() => void save()}>
          {saving ? "Saving…" : "Re-save selection"}
        </Button>
      </div>
      {message ? (
        <div className="text-xs text-white/70" role="status">
          {message}
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- *
 * Local checkbox control                                                      *
 * -------------------------------------------------------------------------- */

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-sm text-white/85 transition",
        "hover:border-white/10 hover:bg-white/[0.03]"
      )}
    >
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
