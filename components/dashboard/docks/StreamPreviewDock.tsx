"use client";

import * as React from "react";
import { Signal, Wifi } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import { twitchParentQueryString } from "@/lib/twitch-embed-parents";

function useChannelLogin(channelTwitchId: string | null, ready: boolean): string | null {
  const [login, setLogin] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!ready || !channelTwitchId) {
      setLogin(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/twitch/channel-info?channelTwitchId=${encodeURIComponent(channelTwitchId)}`, {
      cache: "no-store"
    })
      .then(async (r) => (r.ok ? ((await r.json()) as { channel?: { broadcaster_login?: string } }) : null))
      .then((json) => {
        if (cancelled || !json?.channel?.broadcaster_login) return;
        setLogin(json.channel.broadcaster_login);
      })
      .catch(() => {
        if (!cancelled) setLogin(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, channelTwitchId]);
  return login;
}

/** Stream preview dock: Twitch player + stream health readouts only (chat and rewards live in their own docks). */
export function StreamPreviewDock({
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
  const channelLogin = useChannelLogin(channelTwitchId, ready);
  const parentQs = React.useMemo(() => twitchParentQueryString(), []);

  const embedDisabled = !channelLogin;

  const playerSrc =
    channelLogin && parentQs
      ? `https://player.twitch.tv/?channel=${encodeURIComponent(channelLogin)}&muted=true&${parentQs}`
      : null;

  return (
    <DockShell
      title="Stream Preview"
      right={
        channelLogin ? (
          <span className="hidden text-xs text-white/55 sm:inline">
            <span className="font-mono text-primary/90">@{channelLogin}</span>
            <span className="text-white/35"> · </span>
            Player + health
          </span>
        ) : (
          <span className="hidden text-xs text-white/55 sm:inline">Player + health</span>
        )
      }
      dragHandleProps={dragHandleProps}
      onClose={onClose}
      dockLocked={dockLocked}
      onToggleDockLock={onToggleDockLock}
      className="relative isolate"
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        {!ready || !channelTwitchId ? (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/60">
            {!ready ? "Resolving channel…" : "Select a Twitch channel from the profile menu."}
          </div>
        ) : null}

        <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-lg border border-white/10 bg-black/60">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-sky-400/10" />
          <div className="pointer-events-none absolute left-2 top-2 z-20 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-2 py-1 text-[11px] text-white/75 backdrop-blur">
            <Signal className="h-3 w-3 text-primary" />
            Live player
          </div>
          {playerSrc ? (
            <iframe
              title="Twitch stream preview"
              src={playerSrc}
              allowFullScreen
              className="relative z-10 h-full min-h-[220px] w-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture"
            />
          ) : (
            <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center text-xs text-white/55">
              {embedDisabled ? "Loading channel…" : "Unable to build embed URL."}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <Mini label="Dropped frames" value="—" />
          <Mini label="FPS" value="—" />
          <Mini label="RTT" value="—" />
        </div>

        <div className="pointer-events-none flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/60 backdrop-blur">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-white/70" />
            <span>OBS / ingest health appears here when wired to your encoder.</span>
          </div>
          <span className="shrink-0 text-emerald-200/80">Embed</span>
        </div>
      </div>
    </DockShell>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
      <div className="text-white/50">{label}</div>
      <div className="mt-1 font-semibold text-white/80">{value}</div>
    </div>
  );
}
