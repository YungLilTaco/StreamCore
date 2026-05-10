"use client";

import { SelectedChannelProvider } from "@/components/app/SelectedChannelProvider";
import { AppSidebarProvider } from "@/components/app/AppSidebarContext";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SelectedChannelProvider>
      <AppSidebarProvider>{children}</AppSidebarProvider>
    </SelectedChannelProvider>
  );
}
