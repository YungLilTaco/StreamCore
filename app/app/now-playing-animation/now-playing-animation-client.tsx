"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Music2, Settings } from "lucide-react";

/**
 * Shape of `/api/spotify/now-playing` success responses (Spotify passes through).
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

function pickArt(track: SpotifyTrack | null | undefined): string | null {
  const imgs = track?.album?.images ?? [];
  if (!imgs.length) return null;
  for (const img of imgs) {
    if (img.url && (img.width ?? 0) >= 300) return img.url;
  }
  return imgs[0]?.url ?? null;
}

async function readNowPlayingError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string };
    if (typeof j?.message === "string" && j.message.trim()) return j.message.trim();
  } catch {
    /* ignore */
  }
  return `Spotify (${res.status})`;
}

/** Fetch + poll the currently playing track. 4s while playing, 12s while idle / error. */
function useNowPlaying(): { track: TrackView | null; error: string | null; idle: boolean } {
  const [track, setTrack] = React.useState<TrackView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const lastIdRef = React.useRef<string | null>(null);
  const playingRef = React.useRef(false);

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
          playingRef.current = false;
        } else if (res.status === 401 || res.status === 403) {
          setTrack(null);
          setError(await readNowPlayingError(res));
          playingRef.current = false;
        } else if (!res.ok) {
          setTrack(null);
          setError(await readNowPlayingError(res));
          playingRef.current = false;
        } else {
          const json = (await res.json().catch(() => null)) as NowPlayingResponse | null;
          if (!json?.item) {
            setTrack(null);
            setError(null);
            playingRef.current = false;
          } else {
            const item = json.item;
            const id = item.id ?? `${item.name}-${item.artists?.map((a) => a.name).join(",")}`;
            const view: TrackView = {
              id,
              title: item.name ?? "Untitled",
              artist: (item.artists ?? []).map((a) => a.name).join(", ") || "Unknown artist",
              art: pickArt(item),
              durationMs: item.duration_ms ?? 0,
              progressMs: typeof json.progress_ms === "number" ? json.progress_ms : 0,
              isPlaying: json.is_playing !== false
            };
            if (
              lastIdRef.current !== id ||
              !track ||
              track.progressMs !== view.progressMs ||
              track.isPlaying !== view.isPlaying
            ) {
              setTrack(view);
              lastIdRef.current = id;
            }
            setError(null);
            playingRef.current = view.isPlaying;
          }
        }
      } catch {
        if (!cancelled) {
          setError("Network error — check your connection.");
          setTrack(null);
          playingRef.current = false;
        }
      } finally {
        if (!cancelled) {
          const delay = playingRef.current ? 4000 : 12000;
          timer = window.setTimeout(tick, delay);
        }
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const idle = !track && !error;
  return { track, error, idle };
}

export function NowPlayingAnimationClient() {
  const pathname = usePathname() ?? "";
  const isOverlay = pathname.includes("/overlay/");
  const { track, error, idle } = useNowPlaying();

  const [interpolatedProgress, setInterpolatedProgress] = React.useState(0);
  React.useEffect(() => {
    if (!track) {
      setInterpolatedProgress(0);
      return;
    }
    setInterpolatedProgress(track.progressMs);
    if (!track.isPlaying || track.durationMs <= 0) return;
    let raf = 0;
    const start = performance.now();
    const initial = track.progressMs;
    const step = (now: number) => {
      const elapsed = now - start;
      const next = Math.min(track.durationMs, initial + elapsed);
      setInterpolatedProgress(next);
      if (next < track.durationMs) raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [track]);

  return (
    <>
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }
      `}</style>

      <div
        className={
          isOverlay
            ? "flex min-h-screen items-end justify-start p-6"
            : "flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-8"
        }
      >
        {error && !isOverlay ? (
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-100 shadow-xl">
            <div className="font-semibold text-white">Spotify</div>
            <p className="mt-2 leading-relaxed text-rose-100/95">{error}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/app/settings"
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.1]"
              >
                <Settings className="h-3.5 w-3.5" />
                Open Settings
              </Link>
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/[0.1]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Spotify Dashboard
              </a>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-white/50">
              In the Spotify Developer Dashboard, add this redirect URI (same host and port as this site):{" "}
              <code className="break-all font-mono text-white/70">…/api/auth/callback/spotify</code>. Use{" "}
              <code className="font-mono">127.0.0.1</code> or <code className="font-mono">localhost</code> consistently
              with how you open the app.
            </p>
          </div>
        ) : null}

        {error && isOverlay ? (
          <div className="rounded-lg border border-rose-500/25 bg-black/50 px-3 py-2 text-[11px] text-rose-200/90 backdrop-blur">
            Spotify: check connection / Settings
          </div>
        ) : null}

        {idle && !isOverlay ? (
          <div
            key="idle"
            className="np-card np-idle flex max-w-md items-center gap-4 rounded-2xl border border-white/10 bg-black/55 p-6 shadow-2xl shadow-black/60 backdrop-blur-md"
          >
            <div className="np-art relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-primary/25 via-black/50 to-sky-500/15">
              <div className="flex h-full w-full items-center justify-center">
                <Music2 className="h-10 w-10 text-primary/80" />
              </div>
              <div className="np-glow pointer-events-none absolute inset-0 rounded-xl" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="np-title text-lg font-semibold text-white">Waiting for Spotify</div>
              <div className="np-artist mt-1 text-sm text-white/65">
                Start playback in the Spotify app. This page updates every few seconds.
              </div>
              <div className="np-progress mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="np-idle-bar h-full w-1/3 rounded-full bg-gradient-to-r from-primary via-fuchsia-400 to-sky-400" />
              </div>
            </div>
          </div>
        ) : null}

        {idle && isOverlay ? (
          <div className="text-[11px] text-white/35">Waiting for Spotify…</div>
        ) : null}

        {track ? (
          <div
            key={track.id}
            className="np-card flex max-w-md items-center gap-4 rounded-2xl border border-white/10 bg-black/55 p-4 shadow-2xl shadow-black/60 backdrop-blur-md"
          >
            <div className="np-art relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
              {track.art ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={track.art} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Music2 className="h-7 w-7 text-white/40" />
                </div>
              )}
              <div className="np-glow pointer-events-none absolute inset-0 rounded-xl" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="np-title truncate text-base font-semibold text-white">{track.title}</div>
              <div className="np-artist truncate text-sm text-white/70">{track.artist}</div>

              <div className="np-progress mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-fuchsia-400 to-sky-400"
                  style={{
                    width: `${
                      track.durationMs > 0
                        ? Math.min(100, (interpolatedProgress / track.durationMs) * 100)
                        : 0
                    }%`,
                    transition: "width 220ms linear"
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <style jsx global>{`
        @keyframes np-card-in {
          0% {
            opacity: 0;
            transform: translateY(18px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes np-text-in {
          0% {
            opacity: 0;
            transform: translateX(-8px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes np-glow-pulse {
          0%,
          100% {
            box-shadow: inset 0 0 22px rgba(168, 85, 247, 0.18), 0 0 32px rgba(168, 85, 247, 0.18);
          }
          50% {
            box-shadow: inset 0 0 28px rgba(168, 85, 247, 0.36), 0 0 48px rgba(168, 85, 247, 0.32);
          }
        }
        @keyframes np-art-spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        @keyframes np-idle-shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(400%);
          }
        }

        .np-card {
          animation: np-card-in 600ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        .np-title {
          animation: np-text-in 600ms cubic-bezier(0.2, 0.7, 0.2, 1) 120ms both;
        }
        .np-artist {
          animation: np-text-in 600ms cubic-bezier(0.2, 0.7, 0.2, 1) 200ms both;
        }
        .np-progress {
          animation: np-text-in 600ms cubic-bezier(0.2, 0.7, 0.2, 1) 280ms both;
        }
        .np-glow {
          animation: np-glow-pulse 3.4s ease-in-out infinite;
        }
        .np-art img {
          animation: np-art-spin 36s linear infinite;
          transform-origin: 50% 50%;
        }
        .np-idle-bar {
          animation: np-idle-shimmer 2.2s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .np-card,
          .np-title,
          .np-artist,
          .np-progress,
          .np-glow,
          .np-art img,
          .np-idle-bar {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
