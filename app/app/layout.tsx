"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthedClient } from "@/components/auth/auth";
import { Header } from "@/components/sections/Header";
import { Sidebar } from "@/components/sections/Sidebar";
import { Footer } from "@/components/sections/Footer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Basic client-side gate for demo purposes.
    if (!isAuthedClient()) {
      router.replace("/?from=" + encodeURIComponent(pathname || "/app"));
      return;
    }
    setReady(true);
  }, [router, pathname]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-black">
      <div className="relative sv-bg">
        <div className="pointer-events-none absolute inset-0 sv-grid opacity-[0.18]" />
        <Header mode="app" />

        <div className="mx-auto flex w-full max-w-[1480px] gap-0 px-4">
          <Sidebar />
          {children}
        </div>

        <Footer />
      </div>
    </div>
  );
}

