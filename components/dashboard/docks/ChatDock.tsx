"use client";

/**
 * Live Chat dock — **rebuilt baseline** (portal + optional Twitch embed + pop-out).
 *
 * - **Pop-out** (`openTwitchChatWindow`) = full Twitch chat tab; no embed limits.
 * - **Preview in dock** = official `https://www.twitch.tv/embed/.../chat` iframe with correct
 *   `parent=` (see `resolvedTwitchEmbedChatSrc`). Twitch may show a **one-time “Are you sure?”**
 *   the first time you press **Enter** in the embed; that is **expected** and resets on page refresh.
 * - **Resizing** the tile uses react-grid-layout; `globals.css` maps the south handle into the
 *   bottom gutter and lets east/west pass through so the iframe is not “obscured”.
 * - While **Preview in dock** is active, the dock body is stacked above RGL’s resize handles so
 *   clicks reach Twitch’s iframe; use **Back** first if you need to drag-resize the tile on the grid.
 */

import * as React from "react";
import { MessageSquare, Monitor, Radio } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { useSessionBroadcasterLogin } from "@/components/dashboard/docks/useSessionBroadcasterLogin";
import { resolvedTwitchEmbedChatSrc } from "@/components/dashboard/docks/useTwitchChat";
import { openTwitchChatWindow } from "@/lib/twitch-chat-portal";

const BOTTOM_GUTTER_PX = 14;

type ChatView = "portal" | "embed";

function TitleBar({ connected, login }: { connected: boolean; login: string | null }) {
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
        title={connected ? "Session ready" : "Loading"}
      />
      <span className="truncate text-[10px] font-normal text-white/45">
        {login ? `@${login}` : connected ? "Ready" : "…"}
      </span>
    </div>
  );
}

function PortalScreen({
  login,
  onPopOut,
  onEmbedPreview
}: {
  login: string | null;
  onPopOut: () => void;
  onEmbedPreview: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#0a0a0c] via-[#0c0c10] to-[#0a0a0c] p-6 text-center">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_32px_rgba(168,85,247,0.15)]">
        <Radio className="h-7 w-7 text-primary" aria-hidden />
      </div>
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-semibold text-white">Choose how to open chat</p>
        <p className="text-[11px] leading-relaxed text-white/50">
          <span className="font-medium text-white/65">Pop-out</span> — full Twitch window (recommended for mods).
        </p>
        <p className="text-[11px] leading-relaxed text-white/50">
          <span className="font-medium text-white/65">Preview in dock</span> — embedded chat inside the dashboard.
          The first time you press <kbd className="rounded border border-white/20 px-1">Enter</kbd>, Twitch may ask
          you to confirm sending via the embed; that is normal and lasts until you refresh the page.
        </p>
        <p className="text-[11px] leading-relaxed text-white/40">
          To drag-resize this tile on the grid, use <span className="font-medium text-white/55">Back</span> first so
          the layout handles sit above the preview again.
        </p>
        {login ? (
          <p className="text-[11px] text-white/40">
            Channel <span className="font-mono text-primary/90">@{login}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          data-rgl-no-drag
          disabled={!login}
          onClick={onPopOut}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-glow-purple transition hover:bg-primary/90 disabled:opacity-40"
        >
          Pop-out chat
        </button>
        <button
          type="button"
          data-rgl-no-drag
          disabled={!login}
          onClick={onEmbedPreview}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/[0.08]"
        >
          <Monitor className="h-3.5 w-3.5" />
          Preview in dock
        </button>
      </div>
    </div>
  );
}

/** Official Twitch embed: gutter + `globals.css` keep RGL handles off the composer. */
function EmbedChatFrame({ src }: { src: string }) {
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black"
      data-sv-external-gutter-dock
      data-sv-live-chat-dock
    >
      <div className="relative min-h-0 min-w-0 w-full flex-1 overflow-hidden bg-black">
        <iframe
          key={src}
          title="Twitch live chat"
          src={src}
          tabIndex={0}
          className="pointer-events-auto absolute inset-0 z-[60] h-full w-full border-0 bg-black outline-none"
          style={{ pointerEvents: "auto", zIndex: 60 }}
          allow="clipboard-read; clipboard-write; autoplay; encrypted-media; fullscreen; picture-in-picture"
        />
      </div>
      <div
        className="shrink-0 border-t border-white/5 bg-[#0a0a0a]"
        style={{ height: BOTTOM_GUTTER_PX }}
        aria-hidden
      />
    </div>
  );
}

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
  const embedSrc = React.useMemo(() => resolvedTwitchEmbedChatSrc(login), [login]);

  const popOut = React.useCallback(() => {
    if (login) openTwitchChatWindow(login);
  }, [login]);

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col" data-sv-chat-mode={view}>
      <DockShell
        title={<TitleBar connected={ready && Boolean(login)} login={login} />}
        chrome="embed-clean"
        bodyMode="embed"
        embedBodyStaticRoot
        pointerEventsHeader="auto"
        className="h-full min-h-0 min-w-0 border-white/10 bg-[#0a0a0c]"
        contentClassName="flex min-h-0 min-w-0 flex-1 flex-col p-0"
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
                onClick={popOut}
                className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/80 hover:bg-white/[0.06]"
              >
                Pop-out
              </button>
            </div>
          ) : null
        }
      >
        {!ready ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-white/55">
            Loading Twitch account…
          </div>
        ) : view === "portal" || !embedSrc ? (
          <PortalScreen login={login} onPopOut={popOut} onEmbedPreview={() => setView("embed")} />
        ) : (
          <EmbedChatFrame src={embedSrc} />
        )}
      </DockShell>
    </div>
  );
}
