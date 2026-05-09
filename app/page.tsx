import { Header } from "@/components/sections/Header";
import { Hero } from "@/components/sections/Hero";
import { FragmentedVsCentralized } from "@/components/sections/FragmentedVsCentralized";
import { SharedStreamLogic } from "@/components/sections/SharedStreamLogic";
import { MasterOverlay } from "@/components/sections/MasterOverlay";
import { ClosingCTA } from "@/components/sections/ClosingCTA";
import { Footer } from "@/components/sections/Footer";

export default function Page() {
  return (
    <div className="min-h-screen bg-black">
      <div className="relative sv-bg">
        <div className="pointer-events-none absolute inset-0 sv-grid opacity-[0.18]" />
        <Header mode="marketing" />

        <main className="mx-auto w-full max-w-7xl px-4">
          <Hero />
          <FragmentedVsCentralized />
          <SharedStreamLogic />
          <MasterOverlay />
          <ClosingCTA />
        </main>

        <Footer />
      </div>
    </div>
  );
}

