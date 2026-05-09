"use client";

import * as React from "react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { Slider } from "@/components/ui/slider";

function VerticalFader({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="text-[11px] font-semibold tracking-wider text-white/60">{label}</div>
      <div className="flex h-44 w-10 items-center justify-center">
        <div className="w-44 -rotate-90">
          <Slider value={value} onValueChange={onChange} />
        </div>
      </div>
      <div className="text-xs text-white/55">{value}%</div>
    </div>
  );
}

export function SoundMixerDock({
  dragHandleProps,
  onClose
}: {
  dragHandleProps?: any;
  onClose?: () => void;
}) {
  const [master, setMaster] = React.useState(88);
  const [music, setMusic] = React.useState(45);
  const [tts, setTts] = React.useState(68);
  const [fx, setFx] = React.useState(38);

  return (
    <DockShell title="Sound Mixer" dragHandleProps={dragHandleProps} onClose={onClose}>
      <div className="grid h-full grid-cols-2 gap-3 md:grid-cols-4">
        <VerticalFader label="MASTER" value={master} onChange={setMaster} />
        <VerticalFader label="MUSIC" value={music} onChange={setMusic} />
        <VerticalFader label="TTS" value={tts} onChange={setTts} />
        <VerticalFader label="FX" value={fx} onChange={setFx} />
      </div>
    </DockShell>
  );
}

