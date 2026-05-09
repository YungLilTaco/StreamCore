"use client";

import { cn } from "@/components/lib/cn";
import { Card } from "@/components/ui/card";
import { X } from "lucide-react";

export function DockShell({
  title,
  right,
  children,
  className,
  dragHandleProps,
  onClose
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onClose?: () => void;
}) {
  return (
    <Card
      className={cn(
        "h-full overflow-hidden bg-white/5 backdrop-blur-md",
        "border border-white/10",
        className
      )}
    >
      <div
        {...dragHandleProps}
        className={cn(
          "flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3",
          "cursor-move select-none"
        )}
      >
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="flex items-center gap-2">
          {right}
          {onClose ? (
            <button
              type="button"
              aria-label="Close dock"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="h-[calc(100%-48px)] p-4">{children}</div>
    </Card>
  );
}

