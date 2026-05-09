"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "@/components/motion/motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ClosingCTA() {
  return (
    <section id="cta" className="relative pt-14 md:pt-20">
      <div className="mx-auto max-w-6xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/18 via-transparent to-sky-400/10" />
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />

            <div className="relative flex flex-col items-start justify-between gap-6 p-6 md:flex-row md:items-center md:p-10">
              <div>
                <div className="text-xs font-semibold tracking-wider text-primary/90">
                  Final pitch
                </div>
                <h3 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-white md:text-4xl">
                  Stop juggling tabs. Start streaming smarter.
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70 md:text-base">
                  StreamVault brings your bot, overlays, and music into one clean cockpit — so your
                  stream stays smooth and your brain stays quiet.
                </p>
              </div>

              <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
                <Button variant="primary" className="h-11 px-7 shadow-glow-purple">
                  Join the Vault
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

