"use client";

import * as React from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import {
  DashboardGrid,
  type DashboardGridHandle
} from "@/components/dashboard/DashboardGrid";
import { DashboardSessionProvider } from "@/components/app/DashboardSessionProvider";
import { BotEngineProvider } from "@/components/app/BotEngineProvider";

export default function LiveDashboardPage() {
  const [dockMenuOpen, setDockMenuOpen] = React.useState(false);
  const [fillRowGaps, setFillRowGaps] = React.useState(false);
  const gridRef = React.useRef<DashboardGridHandle>(null);

  return (
    <DashboardSessionProvider>
      {/**
       * BotEngineProvider must sit INSIDE DashboardSessionProvider so it can read the live chat
       * stream and shared `chatSend`. Mounting it here ties the bot's running state to the live
       * dashboard tab — the runtime stops the moment the user navigates away or closes the tab.
       */}
      <BotEngineProvider>
        <div className="min-h-[calc(100vh-4rem)]">
          <DashboardHeader
            onToggleDockMenu={() => setDockMenuOpen((v) => !v)}
            onResetLayout={() => gridRef.current?.resetLayout()}
            fillRowGaps={fillRowGaps}
            onFillRowGapsChange={setFillRowGaps}
          />
          <DashboardGrid
            ref={gridRef}
            dockMenuOpen={dockMenuOpen}
            setDockMenuOpen={setDockMenuOpen}
            fillRowGaps={fillRowGaps}
            onFillRowGapsChange={setFillRowGaps}
          />
        </div>
      </BotEngineProvider>
    </DashboardSessionProvider>
  );
}
