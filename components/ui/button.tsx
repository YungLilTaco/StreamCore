"use client";

import * as React from "react";
import { cn } from "@/components/lib/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition will-change-transform",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-0",
        variant === "primary" &&
          "bg-primary text-white shadow-[0_0_0_1px_rgba(168,85,247,.30),0_14px_50px_rgba(168,85,247,.22)] hover:bg-primary/90",
        variant === "secondary" &&
          "bg-white/5 text-white ring-1 ring-white/10 hover:bg-white/8 hover:ring-white/15",
        variant === "ghost" && "bg-transparent text-white/80 hover:bg-white/5 hover:text-white",
        className
      )}
      {...props}
    />
  );
}

