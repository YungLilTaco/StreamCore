"use client";

import * as React from "react";
import { cn } from "@/components/lib/cn";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/10 bg-white/[0.03] backdrop-blur",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,0_24px_70px_rgba(0,0,0,0.55)]",
        className
      )}
      {...props}
    />
  );
}

