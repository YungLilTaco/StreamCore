"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Cpu } from "lucide-react";
import { motion } from "@/components/motion/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/cn";
import { setAuthedClient } from "@/components/auth/auth";

export function Header({ mode = "marketing" }: { mode?: "marketing" | "app" }) {
  const router = useRouter();

  return (
    <div className="sticky top-0 z-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/80 to-black/0" />
      <header className="relative border-b border-white/10 bg-black/30 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href={mode === "app" ? "/app" : "/"} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-lg",
                "bg-primary/20 ring-1 ring-primary/30 shadow-[0_0_0_1px_rgba(168,85,247,.20),0_18px_50px_rgba(168,85,247,.20)]"
              )}
            >
              <Cpu className="h-5 w-5 text-white" />
            </span>
            <span className="text-base font-semibold tracking-wide text-white">
              Stream<span className="text-white/70">Core</span>
            </span>
          </Link>

          {mode === "marketing" ? (
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
          ) : (
            <div className="hidden text-sm text-white/50 md:block">App</div>
          )}

          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-3"
          >
            {mode === "marketing" ? (
              <Button
                variant="ghost"
                className="hidden md:inline-flex"
                onClick={() => router.push("/login")}
              >
                <LogIn className="h-4 w-4" />
                Login
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="hidden md:inline-flex"
                onClick={() => {
                  setAuthedClient(false);
                  router.push("/");
                }}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            )}
            <Button
              variant="primary"
              className="shadow-glow-purple"
              onClick={() => {
                if (mode === "marketing") {
                  router.push("/login");
                } else {
                  window.location.hash = "cta";
                }
              }}
            >
              {mode === "marketing" ? "Get Started" : "Upgrade"}
            </Button>
          </motion.div>
        </div>
      </header>
    </div>
  );
}

