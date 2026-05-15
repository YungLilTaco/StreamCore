"use client";

import * as React from "react";
import { MessageSquare, Monitor, Radio } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { useSessionBroadcasterLogin } from "@/components/dashboard/docks/useSessionBroadcasterLogin";
import { openTwitchChatWindow } from "@/lib/twitch-chat-portal";
import { twitchEmbedChatUrl } from "@/lib/twitch-popout-urls";
import { twitchParentQueryString } from "@/lib/twitch-embed-parents";
import { cn } from "@/components/lib/cn";

type ChatView = "portal" | "embed";

function ChatDockTitle({ connected, login }: { connected: boolean; login: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <span className="truncate">Live Chat</span>
      <span
        className={
          connected
            ? "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
            : "h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/90"
        }
        title={connected ? "Connected" : "Connecting"}
      />
      <span className="truncate text-[10px] font-normal text-white/45">
        {login ? `@${login}` : connected ? "Ready" : "…"}
      </span>
    </div>
  );
}

function ChatPortalPlaceholder({
  login,
  onConnect,
  onEmbed
}: {
  login: string | null;
  onConnect: () => void;
  onEmbed: () => void;
}) {
  return (
    <motionPlaceholder className="flex h-full min-h-[220px] flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#0a0a0c] via-[#0c0c10] to-[#0a0a0c] p-6 text-center">