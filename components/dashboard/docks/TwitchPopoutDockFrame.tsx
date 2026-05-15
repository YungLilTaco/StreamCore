"use client";

import * as React from "react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { useDockEdgeHover } from "@/components/dashboard/docks/useDockEdgeHover";
import { cn } from "@/components/lib/cn";

export function TwitchPopoutDockFrame({
  rootClassName,
  title,
  iframeSrc,
  iframeTitle,
  connected = true,
  clipTopPx = 52,
  dragHandleProps,
  onClose,
  dockLocked,
  onToggleDockLock,
  headerActions
}: {
  rootClassName: string;
  title: React.ReactNode;
  iframeSrc: string | null;
  iframeTitle: string;
  connected?: boolean;
  clipTopPx?: number;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onClose?: () => void;
  dockLocked?: boolean;
  onToggleDockLock?: () => void;
  headerActions?: React.ReactNode;
}) {
  const { ref, onMouseMove, onMouseLeave } = useDockEdgeHover(12);

  return (
    <div
      ref={ref}
      className={cn("sv-twitch-popout-dock-root flex h-full min-h-0 w-full flex-col", rootClassName)}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ ["--sv-popout-clip-top" as string]: `${clipTopPx}px` }}
    >
      <DockShell
        title={title}
        chrome="embed-clean"
        bodyMode="embed"
        className="h-full min-h-0 border-white/10 bg-[#0a0a0c]"
        contentClassName="sv-twitch-popout-body p-0"
        dragHandleProps={dragHandleProps}
        onClose={onClose}
        dockLocked={dockLocked}
        onToggleDockLock={onToggleDockLock}
        actions={headerActions}
      >
        {!iframeSrc ? (
          <div className="flex h-full min-h-[200px] items-center justify-center text-xs text-white/55">
            Loading…
          </div>
        ) : (
          <div className="sv-twitch-popout-clip relative min-h-0 flex-1 overflow-hidden">
            <iframe
              key={iframeSrc}
              title={iframeTitle}
              src={iframeSrc}
              className="sv-twitch-popout-iframe"
              allow="clipboard-read; clipboard-write; autoplay; encrypted-media; fullscreen; picture-in-picture"
            />
          </div>
        )}
      </DockShell>
    </div>
  );
}
