"use client";

import { cn } from "@/components/lib/cn";
import { Card } from "@/components/ui/card";
import { Lock, Unlock, X } from "lucide-react";

export function DockShell({
  title,
  right,
  children,
  className,
  contentClassName,
  /** Twitch/iframe docks: no outer scroll, no padding — avoids covering the embed hit target. */
  bodyMode = "default",
  dragHandleProps,
  onClose,
  dockLocked,
  onToggleDockLock
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  bodyMode?: "default" | "embed";
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onClose?: () => void;
  /** This dock only — locked = cannot drag/resize the tile */
  dockLocked?: boolean;
  onToggleDockLock?: () => void;
}) {
  return (
    <Card
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border border-white/10",
        /* ~80% transparent glass (20% surface) + single blur pass */
        "bg-black/20 backdrop-blur-xl ring-1 ring-white/[0.08]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        {/* Drag only from the title — not from lock/close (fixes flaky clicks vs react-draggable). */}
        <div
          {...(!dockLocked ? dragHandleProps : {})}
          className={cn(
            "min-w-0 flex-1 select-none rounded-md px-1 py-0.5 -mx-1 -my-0.5",
            dockLocked ? "cursor-default" : "sv-drag-handle cursor-grab active:cursor-grabbing",
            !dockLocked ? dragHandleProps?.className : undefined
          )}
        >
          <div className="text-sm font-semibold text-white">{title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {right}
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
            ? "flex flex-col overflow-hidden p-0"
            : "overflow-y-auto p-4",
          contentClassName
        )}
      >
        {children}
      </div>
    </Card>
  );
}

