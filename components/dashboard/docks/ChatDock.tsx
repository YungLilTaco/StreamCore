"use client";

import * as React from "react";
import { MessageSquare, Monitor, Radio } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { useSessionBroadcasterLogin } from "@/components/dashboard/docks/useSessionBroadcasterLogin";
import { openTwitchChatWindow } from "@/lib/twitch-chat-portal";
import { twitchEmbedChatUrl } from "@/lib/twitch-popout-urls";
import { twitchParentQueryString } from "@/lib/twitch-embed-parents";

type ChatView = "portal" | "embed";

function ChatDockTitle({ connected, login }: { connected: boolean; login: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <span className="truncate">Live Chat</span>
      <span
        className={
          connected
            ? "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
            : "h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/90"
        }
        title={connected ? "Connected" : "Connecting"}
      />
      <span className="truncate text-[10px] font-normal text-white/45">
        {login ? `@${login}` : connected ? "Ready" : "…"}
      </span>
    </div>
  );
}

function ChatPortalPlaceholder({
  login,
  onConnect,
  onEmbed
}: {
  login: string | null;
  onConnect: () => void;
  onEmbed: () => void;
}) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#0a0a0c] via-[#0c0c10] to-[#0a0a0c] p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_32px_rgba(168,85,247,0.15)]">
        <Radio className="h-7 w-7 text-primary" aria-hidden />
      </div>
      <div className="max-w-xs space-y-1">
        <p className="text-sm font-semibold text-white">Click to Connect Chat</p>
        <p className="text-[11px] leading-relaxed text-white/50">
          Opens official Twitch chat in a dedicated window — full typing, channel points, bits, and
          mod tools.
          {login ? (
            <>
              {" "}
              Channel <span className="font-mono text-primary/90">@{login}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          data-rgl-no-drag
          disabled={!login}
          onClick={onConnect}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-glow-purple transition hover:bg-primary/90 disabled:opacity-40"
        >
          Connect Chat
        </button>
        <button
          type="button"
          data-rgl-no-drag
          disabled={!login}
          onClick={onEmbed}
          title="Twitch asks you to confirm OK before your first message in the dock; you must do this again after each refresh."
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/[0.08]"
        >
          <Monitor className="h-3.5 w-3.5" />
          Preview in dock (requires confirmation)
        </button>
      </div>
    </div>
  );
}

/**
 * Window Proxy (pop-out) by default; optional official Twitch embed for in-dock preview.
 */
export function ChatDock({
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
  const { login, ready } = useSessionBroadcasterLogin();
  const [view, setView] = React.useState<ChatView>("portal");
  const parentQs = React.useMemo(() => twitchParentQueryString(), []);

  const embedSrc = React.useMemo(() => {
    if (!login || !parentQs) return null;
    return twitchEmbedChatUrl(login, parentQs);
  }, [login, parentQs]);

  const openWindow = React.useCallback(() => {
    if (!login) return;
    openTwitchChatWindow(login);
  }, [login]);

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      data-sv-chat-mode={view}
    >
      <DockShell
        title={<ChatDockTitle connected={ready && Boolean(login)} login={login} />}
        chrome="embed-clean"
        bodyMode="embed"
        className="h-full min-h-0 border-white/10 bg-[#0a0a0c]"
        contentClassName="flex min-h-0 flex-1 flex-col p-0"
        dragHandleProps={dragHandleProps}
        onClose={onClose}
        dockLocked={dockLocked}
        onToggleDockLock={onToggleDockLock}
        actions={
          login ? (
            <div className="flex items-center gap-1">
              {view === "embed" ? (
                <button
                  type="button"
                  data-rgl-no-drag
                  onClick={() => setView("portal")}
                  className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/60 hover:bg-white/[0.06] hover:text-white/85"
                >
                  Back
                </button>
              ) : null}
              <button
                type="button"
                data-rgl-no-drag
                onClick={openWindow}
                className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/80 hover:bg-white/[0.06]"
              >
                Pop-out
              </button>
            </div>
          ) : null
        }
      >
        {!ready ? (
          <div className="flex flex-1 items-center justify-center text-xs text-white/55">
            Loading Twitch account…
          </div>
        ) : view === "portal" || !embedSrc ? (
          <ChatPortalPlaceholder
            login={login}
            onConnect={openWindow}
            onEmbed={() => setView("embed")}
          />
        ) : (
          <iframe
            key={`embed-${embedSrc}`}
            title="Twitch live chat"
            src={embedSrc}
            tabIndex={0}
            className="min-h-0 w-full flex-1 border-0 bg-black outline-none"
            allow="clipboard-read; clipboard-write; autoplay; encrypted-media; fullscreen; picture-in-picture"
          />
        )}
      </DockShell>
    </div>
  );
}
