"use client";

import { Quote } from "lucide-react";
import { motion } from "@/components/motion/motion";
import { Card } from "@/components/ui/card";

export function FoundersNote() {
  return (
    <section id="why" className="relative pt-14 md:pt-20">
      <div className="mx-auto max-w-7xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mx-auto max-w-3xl"
        >
          <Card className="relative overflow-hidden p-6 md:p-10">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
            <div className="relative flex items-start gap-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/10">
                <Quote className="h-5 w-5 text-primary" />
              </span>
              <div>
                <div className="text-xs font-semibold tracking-wider text-primary/90">
                  Founder&apos;s note
                </div>
                <p className="mt-3 text-pretty text-base leading-relaxed text-white/75 md:text-lg">
                  &quot;As a Software Test Engineer and someone who&apos;s been active on Twitch for years, I
                  saw how fragile streaming tools were. StreamCore is built for reliability first—because
                  your tools should never be the reason your stream crashes.&quot;
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

