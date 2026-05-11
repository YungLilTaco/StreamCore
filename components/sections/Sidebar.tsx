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
import { APP_SIDEBAR_EXPANDED_PX, useAppSidebar } from "@/components/app/AppSidebarContext";

/** Viewport-fixed rail toggle: below app header (`4rem`) + same inset as former rail `pt-3`. */
const SIDEBAR_RAIL_TOGGLE_TOP = "top-[calc(4rem+0.75rem)]";

/** `w-9` / `h-9` — used to pin the expanded control flush to the rail’s right / border line. */
const RAIL_TOGGLE_PX = 36;

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

/**
 * Two parts:
 *   1. An in-flow **spacer** (`<div aria-hidden>`) sized to the current expanded/collapsed width.
 *      It does nothing visually — it just occupies a column in the flex row so the main content is
 *      pushed when the menu is open and slides back when it's closed.
 *   2. A **fixed visual panel** glued to `top: 4rem; left: 0` of the viewport. Because it's
 *      `position: fixed`, scrolling the page doesn't move it — the entire menu stays put while the
 *      rest of the dashboard scrolls beneath. No sticky/parent-height-chain gotchas.
 *
 * The toggle button is also `position: fixed` and animates its `left` between the two anchor
 * positions in lockstep with the panel's width.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { sidebarCollapsed, setSidebarCollapsed } = useAppSidebar();

  const targetWidth = sidebarCollapsed ? 0 : APP_SIDEBAR_EXPANDED_PX;

  return (
    <>
      <div
        aria-hidden="true"
        className="hidden shrink-0 transition-[width] duration-300 ease-in-out motion-reduce:transition-none md:block"
        style={{ width: targetWidth }}
      />

      <aside
        className={cn(
          "fixed left-0 top-16 z-30 hidden overflow-hidden border-r bg-zinc-950",
          "transition-[width,border-color] duration-300 ease-in-out motion-reduce:transition-none md:block",
          sidebarCollapsed ? "border-transparent" : "border-[#22c55e]/10"
        )}
        style={{ width: targetWidth, height: "calc(100vh - 4rem)" }}
        aria-label="Primary navigation"
      >
        <div
          className="flex h-full flex-col pt-14 pb-4 pl-3 pr-2"
          style={{ width: APP_SIDEBAR_EXPANDED_PX }}
        >
          <nav className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
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
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        style={{
          left: sidebarCollapsed ? 0 : APP_SIDEBAR_EXPANDED_PX - RAIL_TOGGLE_PX
        }}
        className={cn(
          "fixed z-[45] flex h-9 w-9 items-center justify-center shadow-lg",
          "transition-[left] duration-300 ease-in-out motion-reduce:transition-none",
          SIDEBAR_RAIL_TOGGLE_TOP,
          "border border-[#22c55e]/15 bg-zinc-950 text-white/85 hover:bg-zinc-900 hover:text-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          sidebarCollapsed ? "rounded-r-lg border-l-0" : "rounded-l-lg border-r-0"
        )}
        aria-label={
          sidebarCollapsed
            ? t("navShowMenu", { defaultValue: "Show menu" })
            : t("navHideMenu", { defaultValue: "Hide menu" })
        }
        aria-expanded={!sidebarCollapsed}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-4 w-4" aria-hidden />
        ) : (
          <PanelLeftClose className="h-4 w-4" aria-hidden />
        )}
      </button>
    </>
  );
}
