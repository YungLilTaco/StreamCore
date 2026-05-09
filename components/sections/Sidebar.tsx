"use client";

import * as React from "react";
import {
  BarChart3,
  Bot,
  Clapperboard,
  Coins,
  Home,
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
  id: string;
  label: string;
  icon: React.ReactNode;
};

const items: Item[] = [
  { id: "home", label: "Home", icon: <Home className="h-4 w-4" /> },
  { id: "live-dashboard", label: "Live Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "overlay-editor", label: "Overlay editor", icon: <Palette className="h-4 w-4" /> },
  { id: "streamvault-bot", label: "StreamVault bot", icon: <Bot className="h-4 w-4" /> },
  { id: "now-playing-animation", label: "Now playing animation", icon: <Wand2 className="h-4 w-4" /> },
  { id: "song-requests", label: "Song requests", icon: <Music2 className="h-4 w-4" /> },
  { id: "shoutout-clip-player", label: "Shoutout Clip player", icon: <Clapperboard className="h-4 w-4" /> },
  { id: "random-clip-player", label: "Random Clip player", icon: <Shuffle className="h-4 w-4" /> },
  { id: "stream-spirits", label: "Stream Spirits", icon: <Sparkles className="h-4 w-4" /> },
  { id: "tts-bot", label: "TTS Bot", icon: <Mic className="h-4 w-4" /> },
  { id: "green-screen-videos", label: "Green screen videos", icon: <Video className="h-4 w-4" /> },
  { id: "sound-alerts", label: "Sound alerts", icon: <PlaySquare className="h-4 w-4" /> },
  { id: "marketplace", label: "Marketplace", icon: <Coins className="h-4 w-4" /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> }
];

export function Sidebar() {
  const [active, setActive] = React.useState<string>("home");

  React.useEffect(() => {
    const ids = items.map((i) => i.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];
        if (!visible?.target?.id) return;
        setActive(visible.target.id);
      },
      {
        root: null,
        threshold: [0.15, 0.25, 0.35, 0.5],
        rootMargin: "-20% 0px -70% 0px"
      }
    );

    for (const el of elements) observer.observe(el);

    // Initial hash -> active
    const hash = (window.location.hash || "").replace("#", "");
    if (hash && ids.includes(hash)) setActive(hash);

    return () => observer.disconnect();
  }, []);

  function goTo(id: string) {
    setActive(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.location.hash = id;
  }

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
                const isActive = active === item.id;
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    onClick={() => goTo(item.id)}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    className={cn(
                      "group relative flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
                      "border-transparent bg-white/[0.02] text-white/70 hover:bg-white/[0.04] hover:text-white",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                      isActive &&
                        "border-primary/25 bg-primary/[0.10] text-white shadow-[0_0_0_1px_rgba(168,85,247,.16),0_18px_55px_rgba(0,0,0,0.45)]"
                    )}
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
                  </motion.button>
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

