"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { Heart, ListMusic, Music2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { cn } from "@/components/lib/cn";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import { spotifyTrackIdFromUri } from "@/lib/spotify-track-uri";

/**
 * Subset of Spotify's `/me/player/currently-playing` response we render. The endpoint may
 * return 204 (nothing playing) — we map that to `null`.
 */
type SpotifyImage = { url: string; width?: number; height?: number };
type SpotifyArtist = { name: string };
type SpotifyAlbum = { images?: SpotifyImage[] };
type SpotifyTrack = {
  id?: string;
  name?: string;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
  duration_ms?: number;
};
type NowPlayingResponse = {
  is_playing?: boolean;
  progress_ms?: number | null;
  item?: SpotifyTrack | null;
};

type TrackView = {
  id: string;
  title: string;
  artist: string;
  art: string | null;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
};

type DeviceRow = {
  id: string;
  is_active: boolean;
  is_restricted?: boolean;
  volume_percent: number | null;
};

function pickControllableDevice(devices: DeviceRow[] | undefined): DeviceRow | null {
  if (!devices?.length) return null;
  const activeOk = devices.find((d) => d.is_active && !d.is_restricted);
  if (activeOk) return activeOk;
  return devices.find((d) => !d.is_restricted) ?? null;
}

type QueueItemDTO = {
  id: string;
  title: string;
  artist: string;
  spotifyUri: string | null;
  requestedByLogin: string;
};

function queueTrackIdFromStoredUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  return spotifyTrackIdFromUri(uri);
}

function pickArt(track: SpotifyTrack | null | undefined): string | null {
  const imgs = track?.album?.images ?? [];
  for (const img of imgs) {
    if (img.url && (img.width ?? 0) >= 200) return img.url;
  }
  return imgs[0]?.url ?? null;
}

/** Fetch + poll the currently playing track. 4s while playing, 12s while idle. */
function useNowPlaying(refreshSignal: number): { track: TrackView | null; error: string | null } {
  const [track, setTrack] = React.useState<TrackView | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function tick() {
      try {
        const res = await fetch("/api/spotify/now-playing", { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 204) {
          setTrack(null);
          setError(null);
        } else if (res.status === 401 || res.status === 403) {
          let msg = "Spotify not connected. Sign in again from Settings.";
          try {
            const j = (await res.json()) as { message?: string };
            if (typeof j?.message === "string" && j.message.trim()) msg = j.message.trim();
          } catch {
            /* ignore */
          }
          setError(msg);
          setTrack(null);
        } else if (!res.ok) {
          let msg = `Spotify (${res.status})`;
          try {
            const j = (await res.json()) as { message?: string };
            if (typeof j?.message === "string" && j.message.trim()) msg = j.message.trim();
          } catch {
            /* ignore */
          }
          setError(msg);
          setTrack(null);
        } else {
          const json = (await res.json().catch(() => null)) as NowPlayingResponse | null;
          if (!json?.item) {
            setTrack(null);
          } else {
            const item = json.item;
            const id = item.id ?? `${item.name}-${item.artists?.map((a) => a.name).join(",")}`;
            setTrack({
              id,
              title: item.name ?? "Untitled",
              artist: (item.artists ?? []).map((a) => a.name).join(", ") || "Unknown artist",
              art: pickArt(item),
              durationMs: item.duration_ms ?? 0,
              progressMs: typeof json.progress_ms === "number" ? json.progress_ms : 0,
              isPlaying: json.is_playing !== false
            });
            setError(null);
          }
        }
      } catch {
        if (!cancelled) setError("Network");
      } finally {
        if (!cancelled) {
          const delay = track?.isPlaying ? 4000 : 12000;
          timer = window.setTimeout(tick, delay);
        }
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
    // refreshSignal forces a re-poll after the user clicks a transport button. We don't include
    // `track` in deps — that would re-create the poll loop every 4s. We close over the latest
    // `track` value through the standard closure capture, which is acceptable because the only
    // thing that reads it is the `delay` calculation a few lines up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  return { track, error };
}

export function SpotifyBridgeDock({
  dragHandleProps,
  onClose,
  dockLocked,
  onToggleDockLock
}: {
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onClose?: () => void;
  dockLocked?: boolean;
  onToggleDockLock?: () => void;
}) {
  const { channelTwitchId, ready } = useSelectedChannel();
  /**
   * `refreshSignal` is incremented after a successful control action to re-poll the now-playing
   * endpoint immediately instead of waiting for the next 4-second tick. Avoids the awkward
   * "I hit play, why does it still say paused" beat.
   */
  const [refreshSignal, setRefreshSignal] = React.useState(0);
  const { track, error } = useNowPlaying(refreshSignal);
  const triggerRefresh = React.useCallback(() => setRefreshSignal((n) => n + 1), []);

  const [liked, setLiked] = React.useState<boolean | null>(null);
  const [volume, setVolume] = React.useState<number | null>(null);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const [songQueue, setSongQueue] = React.useState<QueueItemDTO[]>([]);
  const [spotifyLinked, setSpotifyLinked] = React.useState<boolean | null>(null);
  /** False when Spotify returns 401/403 on library endpoints (stale token or missing scopes). */
  const [libraryScopeOk, setLibraryScopeOk] = React.useState(true);
  const consumedQueueHeadRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    consumedQueueHeadRef.current = null;
  }, [channelTwitchId]);

  React.useEffect(() => {
    let cancelled = false;
    void fetch("/api/spotify/link-status", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((j: { linked?: boolean } | null) => {
        if (!cancelled) setSpotifyLinked(Boolean(j?.linked));
      })
      .catch(() => {
        if (!cancelled) setSpotifyLinked(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!ready || !channelTwitchId) {
      setSongQueue([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      void fetch(
        `/api/channel/song-request-queue?channelTwitchId=${encodeURIComponent(channelTwitchId)}`,
        { cache: "no-store" }
      )
        .then(async (r) => (r.ok ? r.json() : null))
        .then((j: { queue?: QueueItemDTO[] } | null) => {
          if (!cancelled && Array.isArray(j?.queue)) setSongQueue(j.queue);
        })
        .catch(() => {
          if (!cancelled) setSongQueue([]);
        });
    };
    load();
    const t = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [ready, channelTwitchId]);

  /**
   * When the now-playing track matches the head of the song-request queue, remove that row so the
   * bridge list stays in sync with Spotify playback (covers !sr, channel points, etc.).
   */
  React.useEffect(() => {
    if (!ready || !channelTwitchId || !track?.id || songQueue.length === 0 || !track.isPlaying) return;
    const head = songQueue[0];
    const headTid = queueTrackIdFromStoredUri(head.spotifyUri);
    if (!headTid || headTid !== track.id) return;
    if (consumedQueueHeadRef.current === head.id) return;
    consumedQueueHeadRef.current = head.id;
    void fetch(
      `/api/channel/song-request-queue?channelTwitchId=${encodeURIComponent(channelTwitchId)}&id=${encodeURIComponent(head.id)}`,
      { method: "DELETE" }
    )
      .then((r) => {
        if (!r.ok) consumedQueueHeadRef.current = null;
        else setSongQueue((q) => (q.length && q[0]?.id === head.id ? q.slice(1) : q));
      })
      .catch(() => {
        consumedQueueHeadRef.current = null;
      });
  }, [ready, channelTwitchId, track?.id, track?.isPlaying, songQueue]);

  // Reload "liked" state whenever the track id changes.
  React.useEffect(() => {
    if (!track?.id || track.id.length !== 22) {
      setLiked(null);
      setLibraryScopeOk(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/spotify/like?id=${encodeURIComponent(track.id)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { liked?: boolean; code?: string } | null;
        if (cancelled) return;
        if (r.status === 401 || r.status === 403) {
          setLibraryScopeOk(false);
          setLiked(false);
          return;
        }
        setLibraryScopeOk(true);
        setLiked(typeof j?.liked === "boolean" ? j.liked : false);
      })
      .catch(() => {
        if (!cancelled) {
          setLiked(false);
          setLibraryScopeOk(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [track?.id]);

  // Volume: prefer an active, non-restricted device (Spotify returns 403 if the active output
  // cannot be volume-controlled).
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/spotify/devices", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((j: { devices?: DeviceRow[] } | null) => {
        if (cancelled) return;
        const picked = pickControllableDevice(j?.devices);
        if (picked && typeof picked.volume_percent === "number") {
          setVolume(picked.volume_percent);
        } else {
          setVolume(null);
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [refreshSignal]);

  async function doAction(action: "play" | "pause" | "next" | "previous") {
    setPendingAction(action);
    setActionError(null);
    try {
      const res = await fetch(`/api/spotify/playback?action=${action}`, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
        throw new Error(json?.message ?? `Spotify ${res.status}`);
      }
      triggerRefresh();
    } catch (e) {
      setActionError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Action failed");
    } finally {
      setPendingAction(null);
    }
  }

  async function setVolumeAction(value: number) {
    setActionError(null);
    const prevVol = volume;
    setVolume(value); // optimistic
    try {
      const res = await fetch(`/api/spotify/playback?action=volume&value=${Math.round(value)}`, {
        method: "POST"
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
        setVolume(prevVol ?? null);
        if (res.status === 409) triggerRefresh();
        throw new Error(json?.message ?? `Spotify ${res.status}`);
      }
    } catch (e) {
      setActionError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Volume failed");
    }
  }

  async function toggleLike() {
    if (!libraryScopeOk || !track?.id || track.id.length !== 22) return;
    const nextLiked = !(liked === true);
    setLiked(nextLiked); // optimistic
    setActionError(null);
    try {
      const res = await fetch("/api/spotify/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: track.id, liked: nextLiked })
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
        // Roll back the optimistic flip on failure.
        setLiked(!nextLiked);
        if (res.status === 401 || res.status === 403) setLibraryScopeOk(false);
        throw new Error(json?.message ?? `Spotify ${res.status}`);
      }
    } catch (e) {
      setActionError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Like failed");
    }
  }

  return (
    <DockShell
      title="Spotify Bridge"
      dragHandleProps={dragHandleProps}
      onClose={onClose}
      dockLocked={dockLocked}
      onToggleDockLock={onToggleDockLock}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/55">
              Spotify:{" "}
              <span className={cn("font-semibold", spotifyLinked ? "text-emerald-300/90" : "text-amber-200/90")}>
                {spotifyLinked === null ? "…" : spotifyLinked ? "Linked" : "Not linked"}
              </span>
            </span>
            <button
              type="button"
              data-rgl-no-drag
              onClick={() =>
                void signIn("spotify", {
                  callbackUrl: typeof window !== "undefined" ? window.location.href : "/app/dashboard"
                })
              }
              className="inline-flex items-center rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/90 transition hover:bg-white/[0.1]"
            >
              {spotifyLinked ? "Relink Spotify" : "Link Spotify"}
            </button>
          </div>
          <p className="text-[11px] leading-snug text-white/45">
            Remote playback control, queueing from StreamCore, and channel-point song requests require{" "}
            <span className="text-white/70">Spotify Premium</span> (or another plan that allows the Web API player).
            After changing Spotify permissions, use Relink once so your token includes the new scopes.
          </p>
        </div>

        {error && !track ? (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-primary/20 via-black/40 to-sky-400/10">
            {track?.art ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={track.art} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music2 className="h-5 w-5 text-white/40" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">
              {track?.title ?? "Nothing playing"}
            </div>
            <div className="truncate text-xs text-white/55">
              {track?.artist ?? "Open Spotify on a device"}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{
                  width: track && track.durationMs > 0
                    ? `${Math.min(100, (track.progressMs / track.durationMs) * 100)}%`
                    : "0%"
                }}
              />
            </div>
          </div>
          <button
            type="button"
            disabled={!libraryScopeOk || !track?.id || track.id.length !== 22}
            onClick={() => void toggleLike()}
            data-rgl-no-drag
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-md border transition disabled:opacity-40",
              liked === true
                ? "border-pink-400/40 bg-pink-500/15 text-pink-300 hover:bg-pink-500/25"
                : "border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-pink-200"
            )}
            title={
              !libraryScopeOk
                ? "Reconnect Spotify (library scopes) to use Liked Songs"
                : liked === true
                  ? "Unlike"
                  : "Like"
            }
            aria-label={liked === true ? "Remove from Liked Songs" : "Save to Liked Songs"}
          >
            <Heart
              className={cn("h-4 w-4", liked === true ? "fill-current stroke-[1.5]" : "fill-none stroke-[1.75]")}
            />
          </button>
        </div>

        {/**
         * Transport controls. `data-rgl-no-drag` keeps RGL from interpreting button mouse-downs
         * as a dock drag — important because the buttons live above the drag handle area.
         */}
        <div className="flex items-center justify-center gap-2">
          <TransportButton
            label="Previous track"
            disabled={pendingAction !== null}
            onClick={() => void doAction("previous")}
          >
            <SkipBack className="h-4 w-4" />
          </TransportButton>
          <TransportButton
            label={track?.isPlaying ? "Pause" : "Play"}
            disabled={pendingAction !== null}
            onClick={() => void doAction(track?.isPlaying ? "pause" : "play")}
            wide
          >
            {track?.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </TransportButton>
          <TransportButton
            label="Next"
            disabled={pendingAction !== null}
            onClick={() => void doAction("next")}
          >
            <SkipForward className="h-4 w-4" />
          </TransportButton>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/55">
            <ListMusic className="h-3.5 w-3.5 text-primary" />
            Song request queue
          </div>
          <div className="max-h-[200px] min-h-[72px] flex-1 space-y-1.5 overflow-y-auto pr-1 text-xs">
            {!ready || !channelTwitchId ? (
              <div className="text-white/45">Select a channel to load requests.</div>
            ) : songQueue.length === 0 ? (
              <div className="text-white/45">Queue is empty.</div>
            ) : (
              songQueue.map((q, i) => (
                <div
                  key={q.id}
                  className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-white/90"
                >
                  <div className="tabular-nums text-white/35">{String(i + 1).padStart(2, "0")}</div>
                  <div className="font-semibold text-white">{q.title}</div>
                  <div className="text-white/55">
                    {q.artist} <span className="text-white/35">·</span>{" "}
                    <span className="text-primary/90">@{q.requestedByLogin}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
          <div className="flex items-center gap-3">
            {volume === 0 ? (
              <VolumeX className="h-4 w-4 shrink-0 text-white/55" />
            ) : (
              <Volume2 className="h-4 w-4 shrink-0 text-white/55" />
            )}
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume ?? 0}
              disabled={volume === null}
              onChange={(e) => setVolumeAction(Number(e.target.value))}
              data-rgl-no-drag
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-primary disabled:opacity-50"
              aria-label="Volume"
            />
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/60">
              {volume === null ? "—" : `${volume}%`}
            </span>
          </div>
          {volume === null ? (
            <p className="text-[11px] leading-snug text-white/45">
              Volume needs an active Spotify device you can control remotely (not a restricted output). Open Spotify on
              desktop, web, or phone and start playback, then retry.
            </p>
          ) : null}
        </div>

        {actionError ? (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-100">
            {actionError}
          </div>
        ) : null}
      </div>
    </DockShell>
  );
}

function TransportButton({
  children,
  onClick,
  disabled,
  label,
  wide
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-rgl-no-drag
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/85 transition",
        "hover:bg-white/[0.08] hover:text-white disabled:opacity-50",
        wide ? "w-14" : "w-10"
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
