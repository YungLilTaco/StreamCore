"use client";

import * as React from "react";
import { cn } from "@/components/lib/cn";
import { Sidebar } from "@/components/sections/Sidebar";
import { useAppSidebar } from "@/components/app/AppSidebarContext";

/** Full-bleed row: sidebar takes real width in flex; main fills the rest. */
export function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useAppSidebar();

  return (
    <div className="flex w-full min-w-0">
      <Sidebar />
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1",
          /* Fixed rail toggle (w-9) sits at viewport left when collapsed — clear it on md+ */
          sidebarCollapsed && "md:pl-12"
        )}
      >
        {children}
      </div>
    </div>
  );
}
