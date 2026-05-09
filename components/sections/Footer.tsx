"use client";

import { Vault } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/10">
              <Vault className="h-5 w-5 text-primary" />
            </span>
            <div>
              <div className="text-sm font-semibold text-white">
                Stream<span className="text-white/70">Vault</span>
              </div>
              <div className="text-xs text-white/55">
                High-tech tools for modern streamers.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
            <a href="#features" className="hover:text-white">
              Features
            </a>
            <a href="#shared-stream" className="hover:text-white">
              Shared Stream
            </a>
            <a href="#overlays" className="hover:text-white">
              Master Overlay
            </a>
            <a href="#cta" className="hover:text-white">
              Join
            </a>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/50 md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} StreamVault. All rights reserved.</span>
          <span>Electric Purple: #A855F7</span>
        </div>
      </div>
    </footer>
  );
}

