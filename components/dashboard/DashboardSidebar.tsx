"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, LayoutDashboard, Music2, ShoppingBag, Video, Zap } from "lucide-react";
import { cn } from "@/components/lib/cn";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/dashboard", label: "Live Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: "/app/streamvault-bot", label: "Bot & Logic", icon: <Bot className="h-4 w-4" /> },
  { href: "/app/song-requests", label: "Media & Music", icon: <Music2 className="h-4 w-4" /> },
  { href: "/app/marketplace", label: "Vault Marketplace", icon: <ShoppingBag className="h-4 w-4" /> },
  { href: "/app/overlay-editor", label: "Overlay Suite", icon: <Video className="h-4 w-4" /> }
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] w-[300px] border-r border-white/10 bg-black/20 backdrop-blur">
        <div className="flex h-full flex-col px-4 py-6">
          <div className="text-xs font-semibold tracking-wider text-white/40">Command Center</div>

          <nav className="mt-4 flex-1 space-y-2 overflow-auto pr-1 [scrollbar-gutter:stable]">
            {nav.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
                    "border-transparent bg-white/[0.02] text-white/70 hover:bg-white/[0.04] hover:text-white",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                    isActive && "border-primary/25 bg-primary/[0.10] text-white"
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
              );
            })}
          </nav>

          <div className="mt-4">
            <Button variant="primary" className="w-full shadow-glow-purple">
              <Zap className="h-4 w-4" />
              Go Live
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

