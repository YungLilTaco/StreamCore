"use client";

import * as React from "react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import { useChannelLogin } from "@/components/dashboard/docks/useChannelLogin";
import { twitchParentQueryString } from "@/lib/twitch-embed-parents";

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

  const playerSrc =
    channelLogin && parentQs
      ? `https://player.twitch.tv/?channel=${encodeURIComponent(channelLogin)}&muted=true&${parentQs}`
      : null;

  return (
    <DockShell
      title="Stream Preview"
      chrome="embed-clean"
      bodyMode="embed"
      dragHandleProps={dragHandleProps}
      onClose={onClose}
      dockLocked={dockLocked}
      onToggleDockLock={onToggleDockLock}
    >
      {!ready || !channelTwitchId ? (
        <div className="flex h-full min-h-[200px] items-center justify-center px-4 text-center text-xs text-white/55">
          {!ready ? "Resolving channel…" : "Select a channel from the profile menu."}
        </div>
      ) : playerSrc ? (
        <iframe
          title="Twitch stream preview"
          src={playerSrc}
          allowFullScreen
          className="sv-twitch-embed-frame h-full min-h-0 w-full flex-1 border-0 bg-black"
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      ) : (
        <div className="flex h-full min-h-[200px] items-center justify-center text-xs text-white/55">
          Loading channel…
        </div>
      )}
    </DockShell>
  );
}
