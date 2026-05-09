"use client";

import { motion } from "@/components/motion/motion";
import { Card } from "@/components/ui/card";

export function AppPage({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className="text-xs font-semibold tracking-wider text-primary/90">StreamVault</div>
          <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-white md:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-base text-white/70">{description}</p>

          <Card className="mt-8 p-6">
            {children ?? (
              <>
                <div className="text-sm font-semibold text-white">Coming soon</div>
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  This page is wired for navigation + layout. Next step: implement the real UI for{" "}
                  <span className="text-white">{title}</span>.
                </p>
              </>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

