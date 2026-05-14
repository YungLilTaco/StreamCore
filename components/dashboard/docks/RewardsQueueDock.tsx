"use client";

import * as React from "react";
import { Check, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/cn";

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

type RewardQueueItemDTO = {
  id: string;
  rewardId: string;
  rewardTitle: string;
  userLogin?: string;
  userName?: string;
  redeemedAt: string;
  status: string;
};

const POLL_MS = 25_000;

function formatRedeemedAt(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(t);
}

/**
 * Unfulfilled redemptions via Helix (`/api/twitch/reward-queue`).
 *
 * Twitch’s `popout/.../reward-queue` page sends `X-Frame-Options: SAMEORIGIN`, so it cannot be
 * embedded in a third-party iframe (blank panel). This dock is the supported in-app replacement.
 */
export function RewardsQueueDock({
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

  const [items, setItems] = React.useState<RewardQueueItemDTO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState<string | null>(null);
  const [actingId, setActingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!channelTwitchId) return;
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(
        `/api/twitch/reward-queue?channelTwitchId=${encodeURIComponent(channelTwitchId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => null)) as {
        items?: RewardQueueItemDTO[];
        message?: string;
      } | null;
      if (!res.ok) {
        setError(typeof json?.message === "string" ? json.message : `Request failed (${res.status})`);
        return;
      }
      setError(null);
      setItems(Array.isArray(json?.items) ? json!.items! : []);
      if (typeof json?.message === "string" && json.message.trim()) setHint(json.message);
    } catch {
      setItems([]);
      setError("Could not load reward queue.");
    } finally {
      setLoading(false);
    }
  }, [channelTwitchId]);

  const patchRedemption = React.useCallback(
    async (row: RewardQueueItemDTO, status: "FULFILLED" | "CANCELED") => {
      if (!channelTwitchId) return;
      setActingId(row.id);
      setError(null);
      try {
        const res = await fetch("/api/twitch/reward-redemption", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelTwitchId,
            rewardId: row.rewardId,
            redemptionId: row.id,
            status
          })
        });
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        if (!res.ok) {
          setError(typeof j?.message === "string" ? j.message : `Update failed (${res.status})`);
          return;
        }
        await load();
      } finally {
        setActingId(null);
      }
    },
    [channelTwitchId, load]
  );

  React.useEffect(() => {
    if (!ready || !channelTwitchId) return;
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [ready, channelTwitchId, load]);

  const popoutHref = channelLogin
    ? `https://www.twitch.tv/popout/${encodeURIComponent(channelLogin)}/reward-queue`
    : null;

  return (
    <DockShell
      title="Reward queue"
      bodyMode="embed"
      dragHandleProps={dragHandleProps}
      onClose={onClose}
      dockLocked={dockLocked}
      onToggleDockLock={onToggleDockLock}
      right={
        channelLogin ? (
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[11px] text-primary/90 sm:inline">@{channelLogin}</span>
            <Button
              type="button"
              variant="ghost"
              className="h-8 gap-1 px-2 text-[11px] text-white/75"
              disabled={loading}
              onClick={() => void load()}
              title="Refresh queue"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <a
              href={`https://dashboard.twitch.tv/u/${encodeURIComponent(channelLogin)}/community/channel-points`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-cyan-200/90 transition hover:bg-white/5 hover:text-cyan-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Dashboard
            </a>
          </div>
        ) : null
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2">
        {!ready || !channelTwitchId ? (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/60">
            {!ready ? "Resolving channel…" : "Select a Twitch channel from the profile menu."}
          </div>
        ) : null}

        <div className="flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/40">
          <div className="border-b border-white/10 bg-black/25 px-3 py-2 text-[11px] leading-snug text-white/50">
            Unfulfilled redemptions for your channel (Helix). To accept or reject rewards in Twitch’s
            full UI, use{" "}
            {popoutHref ? (
              <a href={popoutHref} target="_blank" rel="noopener noreferrer" className="text-cyan-200/90 underline">
                reward queue pop-out
              </a>
            ) : (
              "reward queue pop-out"
            )}
            {" — "}Twitch blocks embedding that page in iframes.
          </div>

          {error ? (
            <div className="flex flex-1 flex-col justify-center gap-2 p-4 text-sm text-amber-200/90">
              <p>{error}</p>
            </div>
          ) : loading && items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-white/55">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading queue…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-white/55">
              <p>No unfulfilled redemptions right now.</p>
              {hint ? <p className="max-w-md text-xs text-amber-200/85">{hint}</p> : null}
            </div>
          ) : (
            <ul className="min-h-0 flex-1 list-none space-y-0 overflow-y-auto p-2">
              {items.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 border-b border-white/[0.06] py-2.5 pl-1 pr-1 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white/90">{row.rewardTitle}</div>
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-white/55">
                      <span className="text-primary/90">
                        {row.userName || row.userLogin || "Anonymous"}
                        {row.userLogin ? (
                          <span className="font-mono text-white/40"> · {row.userLogin}</span>
                        ) : null}
                      </span>
                      <span className="text-white/35">·</span>
                      <span>{formatRedeemedAt(row.redeemedAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 gap-1 px-2 text-[11px]"
                      disabled={actingId === row.id}
                      onClick={() => void patchRedemption(row, "FULFILLED")}
                      title="Mark fulfilled"
                    >
                      {actingId === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5 text-emerald-300" />
                      )}
                      Fulfill
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 gap-1 px-2 text-[11px] text-white/70"
                      disabled={actingId === row.id}
                      onClick={() => void patchRedemption(row, "CANCELED")}
                      title="Reject / refund points"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {hint && items.length > 0 ? (
            <div className="border-t border-white/10 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/85">
              {hint}
            </div>
          ) : null}
        </div>
      </div>
    </DockShell>
  );
}
