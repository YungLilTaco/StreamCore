"use client";

import * as React from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";

export default function LiveDashboardPage() {
  const [dockMenuOpen, setDockMenuOpen] = React.useState(false);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <DashboardHeader onToggleDockMenu={() => setDockMenuOpen((v) => !v)} />
      <DashboardGrid dockMenuOpen={dockMenuOpen} setDockMenuOpen={setDockMenuOpen} />
    </div>
  );
}

