"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { motion } from "@/components/motion/motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export function Hero() {
  return (
    <section id="home" className="relative pt-14 md:pt-20">
      <div className="mx-auto max-w-7xl px-4">
        <motion.div
          initial="hidden"
          animate="show"
          transition={{ duration: 0.55, ease: "easeOut" }}
          variants={fadeUp}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Built for streamers who hate tab-overload
          </div>

          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            <span className="sv-shimmer">The Ultimate Cockpit for Modern Streamers.</span>
          </h1>
          <p className="mt-5 text-pretty text-base leading-relaxed text-white/70 md:text-lg">
            Eliminate tab-overload. Centralize your chatbot, music, and overlays into one powerful
            cloud-based dashboard.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="primary"
                className="h-11 w-full px-6 shadow-glow-purple sm:w-auto"
              >
                Get Started for Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>

            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="secondary"
                className="h-11 w-full px-6 sm:w-auto"
                onClick={() => {
                  const el = document.getElementById("features");
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                View Features
              </Button>
            </motion.div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mt-12 md:mt-14"
        >
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 sv-grid opacity-[0.22]" />
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />

            <div className="relative grid gap-6 p-6 md:grid-cols-3 md:gap-8 md:p-8">
              <MiniStat title="Scenes" value="12" sub="Synced templates" />
              <MiniStat title="Commands" value="84" sub="AI-generated logic" />
              <MiniStat title="Overlays" value="1" sub="Master browser source" />
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

function MiniStat({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-5">
      <div className="text-xs font-medium text-white/60">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-2 text-sm text-white/60">{sub}</div>
    </div>
  );
}

