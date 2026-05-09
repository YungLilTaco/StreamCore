"use client";

import { motion } from "@/components/motion/motion";
import { Card } from "@/components/ui/card";

export function PlaceholderSection({
  id,
  title,
  description
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <section id={id} className="relative pt-14 md:pt-20">
      <div className="mx-auto max-w-7xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <div className="text-xs font-semibold tracking-wider text-primary/90">Coming soon</div>
          <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-white md:text-4xl">
            {title}
          </h2>
          <p className="mt-4 max-w-2xl text-pretty text-base text-white/70">{description}</p>

          <Card className="mt-8 p-6">
            <div className="text-sm font-semibold text-white">Placeholder</div>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              This section is wired up for navigation + layout. Next step: implement the real UI for{" "}
              <span className="text-white">{title}</span>.
            </p>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

