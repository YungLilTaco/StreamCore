"use client";

import { Eye, EyeOff, Users } from "lucide-react";
import { motion } from "@/components/motion/motion";
import { Card } from "@/components/ui/card";

export function SharedStreamLogic() {
  return (
    <section id="shared-stream" className="relative pt-14 md:pt-20">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <div className="text-xs font-semibold tracking-wider text-primary/90">
              Unique Selling Point
            </div>
            <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-white md:text-4xl">
              Collaborate Without the Chaos.
            </h2>
            <p className="mt-4 text-pretty text-base leading-relaxed text-white/70">
              The first chatbot with per-command visibility toggles. Keep your co-streamers&apos;
              chat clean while staying engaged with your own community.
            </p>

            <div className="mt-6 grid gap-3">
              <Pill icon={<Users className="h-4 w-4" />} text="Per-streamer routing" />
              <Pill icon={<EyeOff className="h-4 w-4" />} text="Hide noisy commands for co-stream" />
              <Pill icon={<Eye className="h-4 w-4" />} text="Stay visible to your own chat" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.05 }}
          >
            <Card className="relative overflow-hidden p-6">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/12 via-transparent to-transparent" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">Command Visibility</div>
                  <div className="text-xs text-white/55">Shared Stream</div>
                </div>

                <div className="mt-5 space-y-3">
                  <Row cmd="!sr" myChat="Visible" coChat="Hidden" />
                  <Row cmd="!clip" myChat="Visible" coChat="Visible" active />
                  <Row cmd="!tts" myChat="Hidden" coChat="Hidden" />
                  <Row cmd="!shoutout" myChat="Visible" coChat="Hidden" />
                </div>

                <div className="mt-6 rounded-lg border border-white/10 bg-black/30 p-4 text-xs text-white/65">
                  Tip: Keep your co-streamer&apos;s chat readable by hiding commands that spam — without
                  turning them off for you.
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Pill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80 backdrop-blur">
      <span className="text-primary">{icon}</span>
      {text}
    </div>
  );
}

function Row({
  cmd,
  myChat,
  coChat,
  active
}: {
  cmd: string;
  myChat: string;
  coChat: string;
  active?: boolean;
}) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.16 }}>
      <div
        className={[
          "grid grid-cols-3 items-center gap-3 rounded-lg border p-3 text-sm",
          active
            ? "border-primary/30 bg-primary/[0.08]"
            : "border-white/10 bg-white/[0.03]"
        ].join(" ")}
      >
        <div className="font-mono text-white/90">{cmd}</div>
        <div className="text-white/70">{myChat}</div>
        <div className="text-white/70">{coChat}</div>
      </div>
    </motion.div>
  );
}

