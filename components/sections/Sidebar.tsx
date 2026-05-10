"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  Clapperboard,
  Coins,
  LayoutDashboard,
  Layers,
  Mic,
  Music2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PlaySquare,
  Shuffle,
  Sparkles,
  Video,
  Wand2,
  Settings
} from "lucide-react";
import { motion } from "@/components/motion/motion";
import { cn } from "@/components/lib/cn";
import { useTranslation } from "react-i18next";
import { useAppSidebar } from "@/components/app/AppSidebarContext";

type Item = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const items: Item[] = [
  { href: "/app/dashboard", label: "navLiveDashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: "/app/overlay-editor", label: "navOverlayEditor", icon: <Palette className="h-4 w-4" /> },
  { href: "/app/streamcore-bot", label: "navBot", icon: <Bot className="h-4 w-4" /> },
  { href: "/app/now-playing-animation", label: "navNowPlaying", icon: <Wand2 className="h-4 w-4" /> },
  { href: "/app/song-requests", label: "navSongRequests", icon: <Music2 className="h-4 w-4" /> },
  { href: "/app/shoutout-clip-player", label: "navShoutout", icon: <Clapperboard className="h-4 w-4" /> },
  { href: "/app/random-clip-player", label: "navRandomClip", icon: <Shuffle className="h-4 w-4" /> },
  { href: "/app/stream-spirits", label: "navSpirits", icon: <Sparkles className="h-4 w-4" /> },
  { href: "/app/tts-bot", label: "navTts", icon: <Mic className="h-4 w-4" /> },
  { href: "/app/green-screen-videos", label: "navGreenScreen", icon: <Video className="h-4 w-4" /> },
  { href: "/app/sound-alerts", label: "navSoundAlerts", icon: <PlaySquare className="h-4 w-4" /> },
  { href: "/app/marketplace", label: "navMarketplace", icon: <Coins className="h-4 w-4" /> },
  { href: "/app/analytics", label: "navAnalytics", icon: <BarChart3 className="h-4 w-4" /> },
  { href: "/app/settings", label: "navSettings", icon: <Settings className="h-4 w-4" /> }
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { sidebarCollapsed, setSidebarCollapsed } = useAppSidebar();

  if (sidebarCollapsed) {
    return (
      <aside className="relative hidden w-0 shrink-0 overflow-visible md:block">
        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          className={cn(
            "absolute left-0 top-24 z-30 flex h-11 w-9 items-center justify-center rounded-r-lg",
            "border border-l-0 border-white/10 bg-black/50 text-white/85 shadow-lg backdrop-blur",
            "hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          )}
          aria-label={t("navShowMenu", { defaultValue: "Show menu" })}
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden shrink-0 md:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] w-[320px] border-r border-white/10 bg-black/20 backdrop-blur">
        <div className="flex h-full flex-col gap-4 px-4 py-6">
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
                <Layers className="h-5 w-5 text-white" />
              </div>
              <div className="truncate text-sm font-semibold text-white">
                Stream<span className="text-white/70">Core</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10",
                "bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:text-white",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              )}
              aria-label={t("navHideMenu", { defaultValue: "Hide menu" })}
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-auto pr-1 [scrollbar-gutter:stable]">
            <div className="flex flex-col gap-2">
              {items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <motion.div key={item.href} whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
                        "border-transparent bg-white/[0.02] text-white/70 hover:bg-white/[0.04] hover:text-white",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                        isActive &&
                          "border-primary/25 bg-primary/[0.10] text-white shadow-[0_0_0_1px_rgba(168,85,247,.16),0_18px_55px_rgba(0,0,0,0.45)]"
                      )}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition",
                          "border-white/10 bg-white/[0.03] text-white/70 group-hover:text-white",
                          isActive && "border-primary/30 bg-primary/15 text-white"
                        )}
                        aria-hidden="true"
                      >
                        {item.icon}
                      </span>
                      <span className="truncate">{t(item.label)}</span>
                      {isActive ? (
                        <span className="absolute left-0 top-2 h-[calc(100%-1rem)] w-1 rounded-full bg-gradient-to-b from-primary to-fuchsia-400" />
                      ) : null}
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </nav>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60">
            Tip: This is a single-page demo. Most items below are placeholder sections (for now).
          </div>
        </div>
      </div>
    </aside>
  );
}

