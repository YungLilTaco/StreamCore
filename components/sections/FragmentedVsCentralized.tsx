"use client";

import { Bot, LayoutDashboard, Music2 } from "lucide-react";
import { motion } from "@/components/motion/motion";
import { Card } from "@/components/ui/card";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export function FragmentedVsCentralized() {
  return (
    <section id="features" className="relative pt-14 md:pt-20">
      <div className="mx-auto max-w-6xl px-4">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          variants={fadeUp}
          className="mx-auto max-w-2xl text-center"
        >
          <div className="text-xs font-semibold tracking-wider text-primary/90">
            Fragmented → Centralized
          </div>
          <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-white md:text-4xl">
            Replace your “20 tabs open” workflow with one cockpit.
          </h2>
          <p className="mt-4 text-pretty text-base text-white/70">
            StreamVault turns chaos into a clean command center — modular, fast, and built to keep
            you focused mid-stream.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 md:grid-cols-3 md:gap-6">
          <BentoCard
            icon={<LayoutDashboard className="h-5 w-5" />}
            title="Unified Dashboard"
            copy="Manage donations, chat, and analytics in one modular view. Minimize OBS, maximize focus."
          />
          <BentoCard
            icon={<Bot className="h-5 w-5" />}
            title="AI Command Architect"
            copy="Build complex bot logic using natural language. No coding, just conversation."
            highlight
          />
          <BentoCard
            icon={<Music2 className="h-5 w-5" />}
            title="Smart Spotify Integration"
            copy="Sync Spotify Premium. Let your chat queue songs with !sr while displaying stylish “Now Playing” widgets."
          />
        </div>
      </div>
    </section>
  );
}

function BentoCard({
  icon,
  title,
  copy,
  highlight
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  highlight?: boolean;
}) {
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.18 }}>
      <Card
        className={[
          "h-full p-6",
          highlight
            ? "border-primary/25 bg-primary/[0.06] shadow-[0_0_0_1px_rgba(168,85,247,.18),0_30px_90px_rgba(168,85,247,.12)]"
            : ""
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/10">
            <div className="text-primary">{icon}</div>
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-white">{title}</div>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{copy}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

