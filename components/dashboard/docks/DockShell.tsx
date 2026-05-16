"use client";

import { cn } from "@/components/lib/cn";
import { Card } from "@/components/ui/card";
import { Lock, Unlock, X } from "lucide-react";

export function DockShell({
  title,
  actions,
  right,
  children,
  className,
  contentClassName,
  chrome = "default",
  bodyMode = "default",
  /** When true with `bodyMode="embed"`, omits `relative` on the body so nothing creates a stacking context over embeds (Twitch chat “obscured” guard). */
  embedBodyStaticRoot = false,
  /** When `"auto"`, the title/actions header row receives `pointer-events-auto` (Twitch chat dock isolation). */
  pointerEventsHeader,
  dragHandleProps,
  onClose,
  dockLocked,
  onToggleDockLock
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  chrome?: "default" | "embed-clean";
  bodyMode?: "default" | "embed";
  embedBodyStaticRoot?: boolean;
  pointerEventsHeader?: "auto";
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onClose?: () => void;
  dockLocked?: boolean;
  onToggleDockLock?: () => void;
}) {
  const embedClean = chrome === "embed-clean";

  return (
    <Card
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border border-white/10",
        embedClean
          ? "bg-[#0a0a0c] ring-1 ring-white/[0.06]"
          : "bg-black/20 backdrop-blur-xl ring-1 ring-white/[0.08]",
        className
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 border-b border-white/10",
          embedClean ? "bg-[#0a0a0c] px-3 py-2" : "px-4 py-3",
          pointerEventsHeader === "auto" && "pointer-events-auto"
        )}
      >
        <div
          {...(!dockLocked ? dragHandleProps : {})}
          className={cn(
            "min-w-0 flex-1 select-none rounded-md",
            embedClean ? "px-0.5 py-0.5" : "px-1 py-0.5 -mx-1 -my-0.5",
            dockLocked ? "cursor-default" : "sv-drag-handle cursor-grab active:cursor-grabbing",
            !dockLocked ? dragHandleProps?.className : undefined
          )}
        >
          <div className={cn("font-semibold text-white", embedClean ? "text-xs tracking-wide" : "text-sm")}>
            {title}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {right}
          {actions}
          {onToggleDockLock ? (
            <button
              type="button"
              aria-label={dockLocked ? "Unlock this dock" : "Lock this dock"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleDockLock();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
              title={dockLocked ? "Unlock this dock" : "Lock this dock"}
            >
              {dockLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              aria-label="Close dock"
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1",
          bodyMode === "embed"
            ? cn(
                "flex min-h-0 flex-1 flex-col overflow-hidden p-0",
                !embedBodyStaticRoot && "relative",
                embedClean && "sv-dock-embed-body"
              )
            : "overflow-y-auto p-4",
          contentClassName
        )}
      >
        {children}
      </div>
    </Card>
  );
}
