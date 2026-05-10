"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cpu, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isAuthedClient, setAuthedClient } from "@/components/auth/auth";

export default function LoginPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isAuthedClient()) {
      router.replace("/app");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-black">
      <div className="relative sv-bg">
        <div className="pointer-events-none absolute inset-0 sv-grid opacity-[0.18]" />

        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-16">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
                <Cpu className="h-5 w-5 text-white" />
              </span>
              <div>
                <div className="text-sm font-semibold text-white">StreamCore</div>
                <div className="text-xs text-white/60">
                  Demo login (no backend yet)
                </div>
              </div>
            </div>

            <div className="mt-5 text-sm text-white/70">
              Click below to enter the app experience (left menu, sections, etc.). We’ll replace
              this with real auth later.
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                variant="primary"
                className="flex-1 shadow-glow-purple"
                onClick={() => {
                  setAuthedClient(true);
                  router.push("/app");
                }}
              >
                <LogIn className="h-4 w-4" />
                Login
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push("/")}
              >
                Back
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

