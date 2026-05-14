"use client";

import * as React from "react";
import { ChevronDown, Plus, RotateCcw, Rows3, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/cn";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export function DashboardHeader({
  onToggleDockMenu,
  onResetLayout,
  fillRowGaps,
  onFillRowGapsChange
}: {
  onToggleDockMenu: () => void;
  onResetLayout: () => void;
  fillRowGaps: boolean;
  onFillRowGapsChange: (next: boolean) => void;
}) {
  return (
    <div className="sticky top-16 z-40 border-b border-white/10 bg-black/20 backdrop-blur">
      <div className="relative">
        <div className={cn("flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6")}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="text-sm text-white/50">StreamCore</div>
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

            {/**
             * Dashboard Options dropdown — sits immediately to the right of "Add Dock".
             *
             * The "Fill dashboard row gaps" toggle lives here (relocated out of the older Layout
             * settings dropdown) so layout-affecting toggles are grouped next to the dock-add UI.
             */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-9 gap-1 px-2 text-white/80 sm:px-3"
                  aria-label="Dashboard options"
                >
                  <span className="hidden text-xs font-semibold sm:inline">Dashboard Options</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 border-white/10 bg-black/85 backdrop-blur-md">
                <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-primary/90">
                  Layout
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuCheckboxItem
                  checked={fillRowGaps}
                  onCheckedChange={(v) => onFillRowGapsChange(v === true)}
                  onSelect={(e) => e.preventDefault()}
                  className="text-sm text-white/90 focus:bg-white/10"
                >
                  <span className="flex items-center gap-2">
                    <Rows3 className="h-4 w-4 text-primary" />
                    Fill dashboard row gaps (edge-to-edge)
                  </span>
                </DropdownMenuCheckboxItem>
                <p className="px-2 pb-2 pt-1 text-[11px] leading-snug text-white/50">
                  Packs docks upward and snaps them to neighbours to remove whitespace. Dragging still works; overlap is disabled while this is on.
                </p>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" aria-label="Profile">
              <UserCircle2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
        {/**
         * Portal target for the “Add Dock” panel — keeps the menu DOM-under the sticky header
         * so it scrolls with the bar and stays aligned to the top navigation chrome.
         */}
        <div
          id="sv-dashboard-dock-menu-anchor"
          className="pointer-events-none absolute inset-x-0 top-full z-50 flex justify-end px-4 pt-1"
        />
      </div>
    </div>
  );
}
