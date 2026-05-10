"use client";

import * as React from "react";

const STORAGE_KEY = "sv_app_sidebar_collapsed";

type AppSidebarContextValue = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
};

const AppSidebarContext = React.createContext<AppSidebarContextValue | null>(null);

export function AppSidebarProvider({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsedState] = React.useState(false);

  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") setSidebarCollapsedState(true);
    } catch {
      /* ignore */
    }
  }, []);

  const setSidebarCollapsed = React.useCallback((v: boolean) => {
    setSidebarCollapsedState(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const value = React.useMemo(
    () => ({ sidebarCollapsed, setSidebarCollapsed }),
    [sidebarCollapsed, setSidebarCollapsed]
  );

  return <AppSidebarContext.Provider value={value}>{children}</AppSidebarContext.Provider>;
}

/** App shell only (under /app). */
export function useAppSidebar(): AppSidebarContextValue {
  const ctx = React.useContext(AppSidebarContext);
  if (!ctx) {
    throw new Error("useAppSidebar must be used within AppSidebarProvider");
  }
  return ctx;
}

/** Dashboard / headers: safe when not under app shell. */
export function useOptionalAppSidebar(): AppSidebarContextValue | null {
  return React.useContext(AppSidebarContext);
}

/** Matches `AppShellLayout` width so the dashboard lines up with the main column. */
export function appShellContentMaxWidthClass(sidebarCollapsed: boolean): string {
  return sidebarCollapsed ? "max-w-[min(100%,1920px)]" : "max-w-[1480px]";
}
