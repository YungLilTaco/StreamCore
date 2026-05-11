"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import { useDashboardSession } from "@/components/app/DashboardSessionProvider";
import { type ChatMessage, type ChatStatus } from "@/components/dashboard/docks/useTwitchChat";
import { cn } from "@/components/lib/cn";
import { UserProfilePopover } from "@/components/dashboard/UserProfilePopover";

/** `set_id → version_id → { url, title }` — flat lookup table built from `/api/twitch/chat-badges`. */
type ChatBadgeMap = Record<string, Record<string, { url: string; title: string }>>;

/**
 * Loads Twitch global + channel badge images for the selected channel.
 *
 * Twitch responds in ~150ms and badges rarely change, so we fire-and-forget once per channel.
 * Errors are swallowed — chat still renders fine without badges (we just show plain names).
 */
function useTwitchBadges(channelTwitchId: string | null): ChatBadgeMap {
  const [map, setMap] = React.useState<ChatBadgeMap>({});
  React.useEffect(() => {
    if (!channelTwitchId) {
      setMap({});
      return;
    }
    let cancelled = false;
    fetch(`/api/twitch/chat-badges?channelTwitchId=${encodeURIComponent(channelTwitchId)}`, {
      cache: "force-cache"
    })
      .then(async (r) => (r.ok ? ((await r.json()) as { badges?: ChatBadgeMap }) : null))
      .then((json) => {
        if (cancelled || !json?.badges) return;
        setMap(json.badges);
      })
      .catch(() => {
        /* missing badges are non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [channelTwitchId]);
  return map;
}

/**
 * Render the inline badge icons for a chat row from the IRC `badges` tag.
 *
 * The tag is comma-separated `set_id/version_id` pairs. We look each up in the map; unknown
 * pairs (e.g. a new badge type Twitch shipped after we cached the map) are silently skipped
 * rather than rendered as broken images.
 */
function BadgeIcons({ badgesTag, map }: { badgesTag: string; map: ChatBadgeMap }) {
  if (!badgesTag) return null;
  const pairs = badgesTag.split(",").filter(Boolean);
  if (pairs.length === 0) return null;
  return (
    <span className="mr-1 inline-flex items-center gap-1 align-middle">
      {pairs.map((pair, i) => {
        const slash = pair.indexOf("/");
        const setId = slash > 0 ? pair.slice(0, slash) : pair;
        const versionId = slash > 0 ? pair.slice(slash + 1) : "1";
        const badge = map[setId]?.[versionId];
        if (!badge) return null;
        return (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={`${setId}-${versionId}-${i}`}
            src={badge.url}
            alt={badge.title}
            title={badge.title}
            className="h-4 w-4 shrink-0 select-none"
            loading="lazy"
            draggable={false}
          />
        );
      })}
    </span>
  );
}

function ChatStatusPill({ status }: { status: ChatStatus }) {
  let label: string;
  let tone: "live" | "neutral" | "error";
  switch (status.phase) {
    case "live":
      label = "Live";
      tone = "live";
      break;
    case "loading-credentials":
      label = "Authenticating…";
      tone = "neutral";
      break;
    case "connecting":
      label = "Connecting…";
      tone = "neutral";
      break;
    case "joining":
      label = "Joining…";
      tone = "neutral";
      break;
    case "disconnected":
      label = "Reconnecting…";
      tone = "neutral";
      break;
    case "error":
      label = "Offline";
      tone = "error";
      break;
    case "idle":
    default:
      return null;
  }
  return (
    <span
      title={status.phase === "error" ? status.message : `Twitch chat: ${status.phase}`}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold uppercase tracking-wide",
        tone === "live" && "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
        tone === "neutral" && "border-white/10 bg-white/5 text-white/65",
        tone === "error" && "border-rose-400/30 bg-rose-500/10 text-rose-200"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "live" && "animate-pulse bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
          tone === "neutral" && "bg-white/40",
          tone === "error" && "bg-rose-400"
        )}
      />
      {label}
    </span>
  );
}

/** HH:MM in the viewer's locale, derived from the chat row's `tmi-sent-ts`. */
function formatChatTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Inline status text shown right after the `(show message)` toggle on a soft-deleted row.
 *
 *   - timeout → `user timed out for <duration>` (the duration is informative for mods who didn't
 *               trigger the action themselves; we still match the requested phrasing).
 *   - ban     → `banned`
 *   - message → `message deleted`
 *
 * Phrasing is intentionally short so the row stays scannable in a busy chat feed.
 */
function deletedLabel(kind: "timeout" | "ban" | "message" | null, timeoutSec: number | null): string {
  if (kind === "message") return "message deleted";
  if (kind === "ban") return "banned";
  // Treat any unknown kind as a generic timeout fallback.
  const sec = timeoutSec ?? 0;
  if (sec <= 0) return "user timed out";
  if (sec < 60) return `user timed out for ${sec}s`;
  if (sec < 3600) return `user timed out for ${Math.round(sec / 60)}m`;
  if (sec < 86_400) return `user timed out for ${Math.round(sec / 3600)}h`;
  return `user timed out for ${Math.round(sec / 86_400)}d`;
}

/**
 * Renders one chat line.
 *
 * Holds local `revealed` state for soft-deleted rows so each viewer can independently choose to
 * peek at the original content. Reveal state is intentionally NOT lifted — a moderator looking at
 * a removed message shouldn't affect anyone else's view, and unmounting the row (scroll cap, dock
 * close) is allowed to discard the choice.
 */
function ChatRow({ m, badgeMap }: { m: ChatMessage; badgeMap: ChatBadgeMap }) {
  const [revealed, setRevealed] = React.useState(false);

  return (
    <div className="flex items-baseline gap-2">
      <div className="w-10 shrink-0 text-[11px] tabular-nums text-white/40">{formatChatTime(m.ts)}</div>
      <div className="min-w-0 flex-1">
        <BadgeIcons badgesTag={m.badges} map={badgeMap} />
        <UserProfilePopover
          login={m.userLogin || m.user}
          userTwitchId={m.userId}
          displayName={m.user}
          color={m.color}
          badgesTag={m.badges}
          badgeMap={badgeMap}
        >
          <button
            type="button"
            className="m-0 cursor-pointer rounded border-0 bg-transparent p-0 font-semibold underline decoration-transparent transition hover:decoration-current focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
            style={{ color: m.color }}
          >
            {m.user}
          </button>
        </UserProfilePopover>
        {m.deleted ? (
          /**
           * Deleted-row layout per spec: `<name> (show message) <status>`.
           * Clicking the toggle flips to `<name> (hide message) <original text grey + strikethrough>`
           * so the moderation context only gets replaced when the mod actually asks to inspect it.
           */
          <span className="break-words text-white/55">
            {" "}
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="cursor-pointer rounded border-0 bg-transparent p-0 text-[12px] text-emerald-300/80 underline decoration-emerald-400/40 underline-offset-2 transition hover:text-emerald-200 hover:decoration-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
              aria-expanded={revealed}
            >
              {revealed ? "(hide message)" : "(show message)"}
            </button>{" "}
            {revealed ? (
              <span className="break-words italic text-white/40">{m.text}</span>
            ) : (
              <span className="italic text-white/55">{deletedLabel(m.deletedKind, m.deletedTimeoutSec)}</span>
            )}
          </span>
        ) : (
          <span className="break-words text-white/85">: {m.text}</span>
        )}
      </div>
    </div>
  );
}

export function LiveChatDock({
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
  /**
   * Chat state lives on `DashboardSessionProvider` so the user profile popover (which can also
   * render outside this dock) sees the same message stream and stays in sync without us having
   * to open a second IRC connection.
   */
  const { chatStatus: status, chatMessages: messages, chatSend: send } = useDashboardSession();
  const badgeMap = useTwitchBadges(channelTwitchId);

  const [draft, setDraft] = React.useState("");
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  /** True when the user has scrolled up to read history — pause auto-scroll until they come back. */
  const [pinnedToBottom, setPinnedToBottom] = React.useState(true);

  React.useEffect(() => {
    if (!pinnedToBottom) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [messages, pinnedToBottom]);

  const onScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    const el = e.currentTarget;
    const distFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setPinnedToBottom(distFromBottom < 24);
  };

  const canSend = status.phase === "live";
  const onSend = () => {
    if (!canSend) return;
    if (send(draft)) setDraft("");
  };

  return (
    <DockShell
      title="Live Stream Chat"
      right={<ChatStatusPill status={status} />}
      dragHandleProps={dragHandleProps}
      onClose={onClose}
      dockLocked={dockLocked}
      onToggleDockLock={onToggleDockLock}
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        {!ready || !channelTwitchId ? (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/60">
            {!ready ? "Resolving channel…" : "Select a Twitch channel from the profile menu."}
          </div>
        ) : null}

        {status.phase === "error" ? (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-100">
            {status.message}
          </div>
        ) : null}

        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="relative flex-1 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3"
        >
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-white/45">
              {status.phase === "live"
                ? "Waiting for the next message…"
                : "Connecting to Twitch chat…"}
            </div>
          ) : (
            <div className="space-y-1.5 text-sm">
              {messages.map((m) => (
                <ChatRow key={m.id} m={m} badgeMap={badgeMap} />
              ))}
            </div>
          )}

          {!pinnedToBottom ? (
            <button
              type="button"
              onClick={() => {
                setPinnedToBottom(true);
                scrollerRef.current?.scrollTo({
                  top: scrollerRef.current.scrollHeight,
                  behavior: "smooth"
                });
              }}
              className="sticky bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-100 shadow-lg backdrop-blur transition hover:bg-emerald-500/25"
            >
              Jump to latest ↓
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={draft}
            placeholder={canSend ? "Send a message..." : "Connecting…"}
            disabled={!canSend}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            maxLength={500}
          />
          <Button
            variant="secondary"
            className="h-10"
            onClick={onSend}
            disabled={!canSend || !draft.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </DockShell>
  );
}
