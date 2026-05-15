"use client";

import * as React from "react";

/** Resolve Twitch broadcaster login for the selected channel (dashboard docks). */
export function useChannelLogin(channelTwitchId: string | null, ready: boolean): string | null {
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
