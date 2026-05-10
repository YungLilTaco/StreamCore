"use client";

import * as React from "react";
import { cn } from "@/components/lib/cn";
import { Sidebar } from "@/components/sections/Sidebar";
import { appShellContentMaxWidthClass, useAppSidebar } from "@/components/app/AppSidebarContext";

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useAppSidebar();

  return (
    <div
      className={cn(
        "mx-auto flex w-full gap-0 px-4 transition-[max-width] duration-300 ease-out",
        appShellContentMaxWidthClass(sidebarCollapsed)
      )}
    >
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
