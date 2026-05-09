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
  PlaySquare,
  Shuffle,
  Sparkles,
  Video,
  Wand2
} from "lucide-react";
import { motion } from "@/components/motion/motion";
import { cn } from "@/components/lib/cn";

type Item = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const items: Item[] = [
  { href: "/dashboard", label: "Live Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: "/app/overlay-editor", label: "Overlay editor", icon: <Palette className="h-4 w-4" /> },
  { href: "/app/streamvault-bot", label: "StreamVault bot", icon: <Bot className="h-4 w-4" /> },
  { href: "/app/now-playing-animation", label: "Now playing animation", icon: <Wand2 className="h-4 w-4" /> },
  { href: "/app/song-requests", label: "Song requests", icon: <Music2 className="h-4 w-4" /> },
  { href: "/app/shoutout-clip-player", label: "Shoutout Clip player", icon: <Clapperboard className="h-4 w-4" /> },
  { href: "/app/random-clip-player", label: "Random Clip player", icon: <Shuffle className="h-4 w-4" /> },
  { href: "/app/stream-spirits", label: "Stream Spirits", icon: <Sparkles className="h-4 w-4" /> },
  { href: "/app/tts-bot", label: "TTS Bot", icon: <Mic className="h-4 w-4" /> },
  { href: "/app/green-screen-videos", label: "Green screen videos", icon: <Video className="h-4 w-4" /> },
  { href: "/app/sound-alerts", label: "Sound alerts", icon: <PlaySquare className="h-4 w-4" /> },
  { href: "/app/marketplace", label: "Marketplace", icon: <Coins className="h-4 w-4" /> },
  { href: "/app/analytics", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] w-[320px] border-r border-white/10 bg-black/20 backdrop-blur">
        <div className="flex h-full flex-col gap-4 px-4 py-6">
          <div className="flex items-center gap-2 px-2">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div className="text-sm font-semibold text-white">
              Stream<span className="text-white/70">Vault</span>
            </div>
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
                      <span className="truncate">{item.label}</span>
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

