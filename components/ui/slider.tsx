"use client";

import * as React from "react";
import { cn } from "@/components/lib/cn";

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className
}: {
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onValueChange(Number(e.target.value))}
      className={cn(
        "h-2 w-full appearance-none rounded-full bg-white/10 outline-none",
        "accent-purple-400",
        className
      )}
    />
  );
}

