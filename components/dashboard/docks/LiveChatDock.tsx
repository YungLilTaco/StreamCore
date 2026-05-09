"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Msg = { id: string; user: string; color: string; text: string; at: string };

const seed: Msg[] = [
  { id: "1", user: "NightCityWanderer", color: "#60a5fa", text: "That play was absolutely insane!", at: "19:40" },
  { id: "2", user: "ModBot", color: "#a855f7", text: "Keep the chat friendly!", at: "19:41" },
  { id: "3", user: "NeonRider", color: "#34d399", text: "song request when?", at: "19:41" }
];

export function LiveChatDock({
  dragHandleProps,
  onClose
}: {
  dragHandleProps?: any;
  onClose?: () => void;
}) {
  const [messages, setMessages] = React.useState<Msg[]>(seed);
  const [text, setText] = React.useState("");
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = new Date();
    const at = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((m) => [
      ...m,
      { id: String(Date.now()), user: "You", color: "#f472b6", text: trimmed, at }
    ]);
    setText("");
  }

  return (
    <DockShell title="Live Stream Chat" dragHandleProps={dragHandleProps} onClose={onClose}>
      <div className="flex h-full flex-col gap-3">
        <div
          ref={scrollerRef}
          className="flex-1 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3"
        >
          <div className="space-y-2 text-sm">
            {messages.map((m) => (
              <div key={m.id} className="flex gap-2">
                <div className="w-10 shrink-0 text-[11px] text-white/40">{m.at}</div>
                <div className="min-w-0">
                  <span className="font-semibold" style={{ color: m.color }}>
                    {m.user}
                  </span>
                  <span className="text-white/70">: {m.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={text}
            placeholder="Send a message..."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <Button variant="secondary" className="h-10" onClick={send} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </DockShell>
  );
}

