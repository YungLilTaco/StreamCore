"use client";

import * as React from "react";
import { Gift, Heart, Info, Star, UserPlus } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";

type Item = {
  id: string;
  kind: "follow" | "sub" | "gift" | "raid" | "cheer" | "points" | "info";
  text: string;
  at: string;
};

export function ActivityFeedDock({
  dragHandleProps,
  onClose,
  dockLocked,
  onToggleDockLock
}: {
  dragHandleProps?: any;
  onClose?: () => void;
  dockLocked?: boolean;
  onToggleDockLock?: () => void;
}) {
  const { channelTwitchId, ready } = useSelectedChannel();
  const [items, setItems] = React.useState<Item[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (!ready || !channelTwitchId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/twitch/activity-feed?channelTwitchId=${encodeURIComponent(channelTwitchId)}`, {
      cache: "no-store"
    })
      .then(async (r) => {
        const text = await r.text();
        const json = text ? JSON.parse(text) : null;
        if (!r.ok) throw new Error(json?.message ?? text ?? `Request failed (${r.status})`);
        return json as { items?: Item[]; warnings?: string[] };
      })
      .then((json) => {
        setItems(Array.isArray(json.items) ? json.items : []);
        setWarnings(Array.isArray(json.warnings) ? json.warnings : []);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [ready, channelTwitchId]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!ready || !channelTwitchId) return;
    const t = window.setInterval(load, 25_000);
    return () => window.clearInterval(t);
  }, [ready, channelTwitchId, load]);

  return (
    <DockShell
      title="Activity Feed"
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
        {error ? (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-100">{error}</div>
        ) : null}
        {warnings.length ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-100/95">
            <div className="mb-1 flex items-center gap-1 font-semibold text-amber-200/95">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Partial feed
            </div>
            <ul className="list-inside list-disc space-y-0.5 text-amber-100/80">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {loading && !items.length ? (
          <div className="text-sm text-white/50">Loading recent activity…</div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="space-y-2">
            {items.length === 0 && !loading && ready && channelTwitchId ? (
              <div className="text-sm text-white/50">
                No activity rows yet. This dock uses Twitch Helix snapshots: recent follows, subs, and channel-points
                redemptions (broadcaster OAuth with the right scopes). Bits, raids, hype trains, and hype chat are not
                in the REST APIs we call — those need an EventSub/WebSocket bridge. Donations are typically
                StreamLabs/StreamElements, not Twitch Helix.
              </div>
            ) : null}
            {items.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/10">
                  <Icon kind={e.kind} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{e.text}</div>
                  <div className="text-xs text-white/50">{e.at}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DockShell>
  );
}

function Icon({ kind }: { kind: Item["kind"] }) {
  if (kind === "follow") return <UserPlus className="h-4 w-4 text-sky-300" />;
  if (kind === "sub") return <Star className="h-4 w-4 text-primary" />;
  if (kind === "gift") return <Gift className="h-4 w-4 text-fuchsia-300" />;
  if (kind === "raid" || kind === "cheer" || kind === "points") return <Heart className="h-4 w-4 text-rose-300" />;
  return <Info className="h-4 w-4 text-white/50" />;
}
