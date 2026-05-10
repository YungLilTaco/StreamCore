"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type ChannelChoice = {
  channelTwitchId: string;
  channelDisplayName: string;
  role: string;
  isSelf?: boolean;
};

const STORAGE_KEY = "sv_selected_channel_twitch_id";

function isAllowedChannel(channelTwitchId: string, channels: ChannelChoice[]) {
  return channels.some((c) => c.channelTwitchId === channelTwitchId);
}

function mergeChannelIntoPath(pathname: string, channelTwitchId: string, currentSearch: URLSearchParams) {
  const next = new URLSearchParams(currentSearch.toString());
  next.set("channel", channelTwitchId);
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function pushPathWithChannel(
  pathname: string,
  channelTwitchId: string,
  router: ReturnType<typeof useRouter>,
  currentSearch?: URLSearchParams | null
) {
  try {
    localStorage.setItem(STORAGE_KEY, channelTwitchId);
  } catch {
    /* ignore */
  }

  try {
    if (pathname.startsWith("http")) {
      const u = new URL(pathname);
      u.searchParams.set("channel", channelTwitchId);
      router.push(`${u.pathname}${u.search}`);
      return;
    }
  } catch {
    // Fall through — treat as pathname
  }

  const href = mergeChannelIntoPath(pathname, channelTwitchId, currentSearch ?? new URLSearchParams());
  router.push(href);
}

type Ctx = {
  channels: ChannelChoice[];
  /** Resolved channel ID for Twitch APIs — null until permissions load OR no Twitch access. */
  channelTwitchId: string | null;
  /** True after first channel-permissions fetch completed. */
  ready: boolean;
  selectChannel: (channelTwitchId: string, opts?: { navigateTo?: string }) => void;
};

const SelectedChannelContext = React.createContext<Ctx | null>(null);

/** App shell only — returns null on marketing layouts without the provider. */
export function useMaybeSelectedChannel(): Ctx | null {
  return React.useContext(SelectedChannelContext);
}

export function useSelectedChannel(): Ctx {
  const ctx = React.useContext(SelectedChannelContext);
  if (!ctx) {
    throw new Error("useSelectedChannel must be used within SelectedChannelProvider");
  }
  return ctx;
}

function InnerSelectedChannelProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [channels, setChannels] = React.useState<ChannelChoice[]>([]);
  const [ready, setReady] = React.useState(false);
  const [channelTwitchId, setChannelTwitchId] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/channel-permissions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (Array.isArray(json?.channels)) setChannels(json.channels as ChannelChoice[]);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  React.useEffect(() => {
    if (!ready || channels.length === 0) {
      setChannelTwitchId(null);
      return;
    }

    const param = searchParams.get("channel");
    if (param && isAllowedChannel(param, channels)) {
      try {
        localStorage.setItem(STORAGE_KEY, param);
      } catch {
        /* ignore */
      }
      setChannelTwitchId(param);
      return;
    }

    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored && isAllowedChannel(stored, channels)) {
      setChannelTwitchId(stored);
      return;
    }

    const self = channels.find((c) => c.isSelf) ?? channels[0] ?? null;
    const fallback = self?.channelTwitchId ?? null;
    setChannelTwitchId(fallback);
    if (fallback) {
      try {
        localStorage.setItem(STORAGE_KEY, fallback);
      } catch {
        /* ignore */
      }
    }
  }, [ready, channels, searchParams]);

  // Default /app/dashboard to include ?channel=<id> for shareability and consistency with Header navigation.
  React.useEffect(() => {
    if (!ready || pathname !== "/app/dashboard" || !channelTwitchId) return;
    const current = searchParams.get("channel");
    if (current === channelTwitchId) return;
    router.replace(mergeChannelIntoPath(pathname, channelTwitchId, searchParams));
  }, [ready, pathname, channelTwitchId, router, searchParams]);

  const selectChannel = React.useCallback(
    (id: string, opts?: { navigateTo?: string }) => {
      if (!isAllowedChannel(id, channels)) return;
      const target = opts?.navigateTo ?? pathname;
      pushPathWithChannel(target, id, router, target === pathname ? searchParams : new URLSearchParams());
    },
    [channels, pathname, router, searchParams]
  );

  const value = React.useMemo(
    () => ({ channels, ready, channelTwitchId, selectChannel }),
    [channels, ready, channelTwitchId, selectChannel]
  );

  return (
    <SelectedChannelContext.Provider value={value}>{children}</SelectedChannelContext.Provider>
  );
}

/**
 * Tracks which Twitch channel IDs the user owns or has elevated permissions on.
 * Resolves priority: URL `channel` → localStorage → owned channel (`isSelf`) → first permitted channel.
 */
export function SelectedChannelProvider({ children }: { children: React.ReactNode }) {
  return <InnerSelectedChannelProvider>{children}</InnerSelectedChannelProvider>;
}
