"use client";

import Link from "next/link";
import { Vault, LogIn } from "lucide-react";
import { motion } from "@/components/motion/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/cn";

export function Header() {
  return (
    <div className="sticky top-0 z-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/80 to-black/0" />
      <header className="relative border-b border-white/10 bg-black/30 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="#" className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-lg",
                "bg-primary/20 ring-1 ring-primary/30 shadow-[0_0_0_1px_rgba(168,85,247,.20),0_18px_50px_rgba(168,85,247,.20)]"
              )}
            >
              <Vault className="h-5 w-5 text-white" />
            </span>
            <span className="text-sm font-semibold tracking-wide text-white">
              Stream<span className="text-white/70">Vault</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm text-white/70 hover:text-white">
              Features
            </a>
            <a href="#shared-stream" className="text-sm text-white/70 hover:text-white">
              Shared Stream
            </a>
            <a href="#overlays" className="text-sm text-white/70 hover:text-white">
              Master Overlay
            </a>
          </nav>

          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-3"
          >
            <Button variant="ghost" className="hidden md:inline-flex">
              <LogIn className="h-4 w-4" />
              Login
            </Button>
            <Button
              variant="primary"
              className="shadow-glow-purple"
              onClick={() => {
                // Placeholder action
                window.location.hash = "cta";
              }}
            >
              Get Started
            </Button>
          </motion.div>
        </div>
      </header>
    </div>
  );
}

