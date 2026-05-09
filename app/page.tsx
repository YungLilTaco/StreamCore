import { Header } from "@/components/sections/Header";
import { Sidebar } from "@/components/sections/Sidebar";
import { Hero } from "@/components/sections/Hero";
import { FragmentedVsCentralized } from "@/components/sections/FragmentedVsCentralized";
import { SharedStreamLogic } from "@/components/sections/SharedStreamLogic";
import { MasterOverlay } from "@/components/sections/MasterOverlay";
import { ClosingCTA } from "@/components/sections/ClosingCTA";
import { Footer } from "@/components/sections/Footer";
import { PlaceholderSection } from "@/components/sections/PlaceholderSection";

export default function Page() {
  return (
    <div className="min-h-screen bg-black">
      <div className="relative sv-bg">
        <div className="pointer-events-none absolute inset-0 sv-grid opacity-[0.18]" />
        <Header />

        <div className="mx-auto flex w-full max-w-[1480px] gap-0 px-4">
          <Sidebar />

          <main className="min-w-0 flex-1">
            <Hero />
            <FragmentedVsCentralized />

            {/* Placeholder sections to match the left menu */}
            <PlaceholderSection
              id="live-dashboard"
              title="Live Dashboard"
              description="Real-time stream status, activity, and chat — designed for focus during live moments."
            />
            <PlaceholderSection
              id="overlay-editor"
              title="Overlay editor"
              description="Build sleek overlays with a master-source mindset: fast, consistent, and modular."
            />
            <PlaceholderSection
              id="streamvault-bot"
              title="StreamVault bot"
              description="Bot commands, triggers, and per-command visibility — tuned for co-streaming."
            />
            <PlaceholderSection
              id="now-playing-animation"
              title="Now playing animation"
              description="Stylish, animated ‘Now Playing’ widgets that match your brand — without hurting FPS."
            />
            <PlaceholderSection
              id="song-requests"
              title="Song requests"
              description="Queue management, permissions, and Spotify integration for chat-driven requests."
            />
            <PlaceholderSection
              id="shoutout-clip-player"
              title="Shoutout Clip player"
              description="Instant shoutouts that feel premium: curated clips, clean transitions, no awkward pauses."
            />
            <PlaceholderSection
              id="random-clip-player"
              title="Random Clip player"
              description="One-click hype moments. Pull a random clip and keep viewers engaged between matches."
            />
            <PlaceholderSection
              id="stream-spirits"
              title="Stream Spirits"
              description="On-stream characters that react to events — lightweight, expressive, and fun."
            />
            <PlaceholderSection
              id="tts-bot"
              title="TTS Bot"
              description="TTS controls with anti-spam, voice selection, and streamer-first moderation."
            />
            <PlaceholderSection
              id="green-screen-videos"
              title="Green screen videos"
              description="A library for greenscreen assets with quick previews and clean scene insertion."
            />
            <PlaceholderSection
              id="sound-alerts"
              title="Sound alerts"
              description="Custom alerts for subs, donos, and milestones — with reliable playback and mixing."
            />
            <PlaceholderSection
              id="marketplace"
              title="Marketplace"
              description="Themes, overlays, command packs, and widgets — installable in minutes."
            />
            <PlaceholderSection
              id="analytics"
              title="Analytics"
              description="Performance insights that matter: retention, conversion, and what drives chat velocity."
            />

            <SharedStreamLogic />
            <MasterOverlay />
            <ClosingCTA />
          </main>
        </div>

        <Footer />
      </div>
    </div>
  );
}

