"use client";

import * as React from "react";
import { cn } from "@/components/lib/cn";

/**
 * Generic surface card.
 *
 * Note: this used to add `backdrop-blur`, but `DockShell` already adds `backdrop-blur-md` on
 * top of the Card it wraps. Stacking two backdrop-filter passes per dock made the compositor
 * re-rasterize a heavy blur every frame on every dock — the single largest paint cost during
 * dashboard interactions. The blur is kept on the consumer that wants it (DockShell, dropdowns,
 * etc.) so the same visual still renders, but unblurred surfaces (`<Card>` used outside the
 * dashboard, e.g. landing/marketing) now skip the blur cost entirely.
 */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/10 bg-white/[0.03]",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,0_24px_70px_rgba(0,0,0,0.55)]",
        className
      )}
      {...props}
    />
  );
}

