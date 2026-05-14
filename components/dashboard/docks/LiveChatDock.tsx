"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
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

/**
 * Official Twitch chat embed — standalone from Stream Preview so each dock can be
 * sized independently in the dashboard grid.
 */
export function LiveChatDock({
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

  /** Official chat embed — `parent` must be hostname(s) only; see `twitchEmbedParentHostnames()`. */
  const chatSrc =
    channelLogin && parentQs
      ? `https://www.twitch.tv/embed/${encodeURIComponent(channelLogin)}/chat?${parentQs}&darkpopout`
      : null;

  return (
    <DockShell
      title="Live Stream Chat"
      className="!backdrop-blur-none bg-black/35 ring-white/10"
      bodyMode="embed"
      right={
        channelLogin ? (
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[11px] text-primary/90 sm:inline">@{channelLogin}</span>
            <a
              href={`https://www.twitch.tv/popout/${encodeURIComponent(channelLogin)}/chat`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-cyan-200/90 transition hover:bg-white/5 hover:text-cyan-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Pop out
            </a>
          </div>
        ) : null
      }
      dragHandleProps={dragHandleProps}
      onClose={onClose}
      dockLocked={dockLocked}
      onToggleDockLock={onToggleDockLock}
    >
      <div className="flex h-full min-h-0 flex-col gap-2">
        {!ready || !channelTwitchId ? (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/60">
            {!ready ? "Resolving channel…" : "Select a Twitch channel from the profile menu."}
          </div>
        ) : null}

        <div className="relative z-10 flex min-h-[240px] flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/40">
          {chatSrc ? (
            <iframe
              title="Twitch chat"
              src={chatSrc}
              tabIndex={0}
              allow="clipboard-read; clipboard-write; autoplay; encrypted-media; fullscreen; picture-in-picture"
              className="min-h-0 flex-1 border-0 outline-none"
            />
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center px-4 text-center text-xs text-white/55">
              Loading channel…
            </div>
          )}
        </div>
      </div>
    </DockShell>
  );
}
