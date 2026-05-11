"use client";

import * as React from "react";
import { Plus, RotateCcw, Settings, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/cn";

export function DashboardHeader({
  onToggleDockMenu,
  onResetLayout
}: {
  onToggleDockMenu: () => void;
  onResetLayout: () => void;
}) {
  return (
    <div className="sticky top-16 z-40 border-b border-white/10 bg-black/20 backdrop-blur">
      <div className={cn("flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6")}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-sm text-white/50">Dashboard</div>
          <div className="h-4 w-px bg-white/10" />
          <div className="truncate text-sm font-semibold text-white">Live Dashboard</div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" className={cn("text-white/75")} onClick={onResetLayout}>
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Reset layout</span>
          </Button>
          <Button variant="secondary" onClick={onToggleDockMenu}>
            <Plus className="h-4 w-4" />
            Add Dock
          </Button>
          <Button variant="ghost" className={cn("hidden md:inline-flex")}>
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          <Button variant="ghost" aria-label="Profile">
            <UserCircle2 className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

