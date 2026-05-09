"use client";

import * as React from "react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";

export function StreamInfoDock({
  dragHandleProps,
  onClose
}: {
  dragHandleProps?: any;
  onClose?: () => void;
}) {
  const [title, setTitle] = React.useState("GRINDING TO TOP 500 | GOAL");
  const [category, setCategory] = React.useState("Apex Legends");
  const [saved, setSaved] = React.useState(false);

  function save() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <DockShell
      title="Stream Info"
      right={
        saved ? (
          <span className="text-xs text-emerald-200">Saved</span>
        ) : null
      }
      dragHandleProps={dragHandleProps}
      onClose={onClose}
    >
      <div className="flex h-full flex-col gap-3">
        <div>
          <div className="text-xs font-semibold tracking-wider text-white/50">Title</div>
          <div className="mt-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wider text-white/50">Category</div>
          <div className="mt-2">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>

        <div className="mt-auto flex gap-2">
          <Button variant="primary" className="shadow-glow-purple" onClick={save}>
            <Save className="h-4 w-4" />
            Save changes
          </Button>
          <Button variant="secondary" onClick={() => { setTitle(""); setCategory(""); }}>
            Clear
          </Button>
        </div>
      </div>
    </DockShell>
  );
}

