"use client";

import * as React from "react";
import { cn } from "@/components/lib/cn";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-white",
        "placeholder:text-white/40 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/30",
        className
      )}
      {...props}
    />
  );
}

