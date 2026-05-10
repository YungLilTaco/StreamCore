"use client";

import * as React from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import {
  DashboardGrid,
  type DashboardGridHandle
} from "@/components/dashboard/DashboardGrid";

export default function LiveDashboardPage() {
  const [dockMenuOpen, setDockMenuOpen] = React.useState(false);
  const gridRef = React.useRef<DashboardGridHandle>(null);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <DashboardHeader
        onToggleDockMenu={() => setDockMenuOpen((v) => !v)}
        onResetLayout={() => gridRef.current?.resetLayout()}
      />
      <DashboardGrid
        ref={gridRef}
        dockMenuOpen={dockMenuOpen}
        setDockMenuOpen={setDockMenuOpen}
      />
    </div>
  );
}
