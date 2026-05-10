"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/components/lib/cn";

export function Avatar({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full",
        "ring-1 ring-white/10 bg-white/[0.03]",
        className
      )}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  );
}

export function AvatarFallback({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full",
        "text-xs font-semibold text-white/80",
        className
      )}
      {...props}
    />
  );
}

