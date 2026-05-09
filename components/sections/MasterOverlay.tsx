"use client";

import { Link2, Zap, Layers } from "lucide-react";
import { motion } from "@/components/motion/motion";
import { Card } from "@/components/ui/card";

export function MasterOverlay() {
  return (
    <section id="overlays" className="relative pt-14 md:pt-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <div className="text-xs font-semibold tracking-wider text-primary/90">
              Master Overlay
            </div>
            <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-white md:text-4xl">
              One Link. Infinite Possibilities.
            </h2>
            <p className="mt-4 text-pretty text-base leading-relaxed text-white/70">
              Reduce OBS CPU usage by rendering your Chat, Music, Avatars, and Alerts through a
              single, optimized browser source.
            </p>

            <div className="mt-6 grid gap-3">
              <FeatureLine
                icon={<Link2 className="h-4 w-4" />}
                title="Single browser source"
                text="One URL for everything. Keep scenes lightweight."
              />
              <FeatureLine
                icon={<Layers className="h-4 w-4" />}
                title="Composable widgets"
                text="Stack and arrange modules like building blocks."
              />
              <FeatureLine
                icon={<Zap className="h-4 w-4" />}
                title="Optimized rendering"
                text="Fewer sources, fewer frame drops, smoother streams."
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.05 }}
          >
            <Card className="relative overflow-hidden p-6">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-sky-400/10" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">Master Source</div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/70">
                    obs://browser
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <Widget title="Chat" />
                  <Widget title="Now Playing" active />
                  <Widget title="Alerts" />
                  <Widget title="Avatars" />
                </div>

                <div className="mt-6 rounded-lg border border-white/10 bg-black/30 p-4 text-xs text-white/65">
                  Render once, reuse everywhere — your overlays stay consistent across every scene.
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FeatureLine({
  icon,
  title,
  text
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mt-0.5 text-primary">{icon}</div>
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-1 text-sm text-white/65">{text}</div>
      </div>
    </div>
  );
}

function Widget({ title, active }: { title: string; active?: boolean }) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.16 }}>
      <div
        className={[
          "flex items-center justify-between rounded-lg border p-4",
          active
            ? "border-primary/30 bg-primary/[0.08]"
            : "border-white/10 bg-white/[0.03]"
        ].join(" ")}
      >
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-xs text-white/55">Widget</div>
      </div>
    </motion.div>
  );
}

