"use client";

import * as React from "react";
import { Columns3, Rows3 } from "lucide-react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { cn } from "@/components/lib/cn";

type Orientation = "vertical" | "horizontal";

const ORIENTATION_STORAGE_KEY = "sv_sound_mixer_orientation_v1";

/**
 * One channel definition. Stored centrally so adding a new source later is a single line and the
 * layout (both vertical and horizontal modes) divides the available space automatically.
 */
type Channel = {
  key: string;
  label: string;
  value: number;
  setValue: (v: number) => void;
};

/**
 * Shared slider track — works in both vertical and horizontal orientations.
 *
 * The track is plain divs (no native `<input type="range">`) so the tube and thumb scale with
 * pixel-perfect accuracy to whatever space the parent gives them, in either axis. Interaction
 * is the same in both modes: `onPointerDown` captures the pointer so a drag works even when it
 * leaves the track, plus full keyboard support that maps to the slider's *visual* orientation
 * (Up/Down for vertical, Left/Right for horizontal).
 *
 * Convention:
 *   - vertical:  top = 100, bottom = 0  (matches a real mixing console)
 *   - horizontal: left = 0,  right = 100 (matches every horizontal volume bar UX ever)
 *
 * Home/End follow ARIA semantics (Home → min, End → max) regardless of orientation; the visual
 * meaning ("Home goes to the bottom in vertical mode") falls out of the convention above.
 */
function SliderTrack({
  value,
  onChange,
  orientation,
  ariaLabel
}: {
  value: number;
  onChange: (v: number) => void;
  orientation: Orientation;
  ariaLabel: string;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  const valueFromEvent = React.useCallback(
    (clientX: number, clientY: number): number => {
      const el = trackRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      if (orientation === "vertical") {
        if (rect.height <= 0) return value;
        const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        return Math.round(ratio * 100);
      }
      if (rect.width <= 0) return value;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * 100);
    },
    [orientation, value]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(valueFromEvent(e.clientX, e.clientY));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return;
    onChange(valueFromEvent(e.clientX, e.clientY));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1;
    let next = value;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = Math.min(100, value + step);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = Math.max(0, value - step);
        break;
      case "PageUp":
        next = Math.min(100, value + 10);
        break;
      case "PageDown":
        next = Math.max(0, value - 10);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 100;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(next);
  };

  const isVertical = orientation === "vertical";

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-orientation={orientation}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative cursor-pointer select-none rounded-full bg-white/[0.08] touch-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
        isVertical ? "h-full w-1" : "h-1 w-full"
      )}
    >
      {/* Filled portion. Grows from bottom-up (vertical) or left-to-right (horizontal). */}
      <div
        className={cn(
          "pointer-events-none absolute rounded-full bg-purple-400/50",
          isVertical ? "inset-x-0 bottom-0" : "inset-y-0 left-0"
        )}
        style={isVertical ? { height: `${value}%` } : { width: `${value}%` }}
      />
      {/* Thumb. Inverted axis on vertical so 100 sits at the top of the column. */}
      <div
        className={cn(
          "pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-400 shadow-[0_0_0_2px_rgba(168,85,247,0.22)] transition-shadow",
          "group-hover:shadow-[0_0_0_3px_rgba(168,85,247,0.28)]",
          "group-active:shadow-[0_0_0_4px_rgba(168,85,247,0.34)]"
        )}
        style={
          isVertical
            ? { left: "50%", top: `${100 - value}%` }
            : { left: `${value}%`, top: "50%" }
        }
      />
    </div>
  );
}

/**
 * Vertical channel strip — label on top, tall thin fader, value on the bottom.
 *
 * `flex-1` only, no `max-w` cap: strips share the available row width evenly and grow to fill
 * the dock whether you have 4 sources or 12. A `min-w-[40px]` floor keeps them from collapsing
 * on a very narrow dock; the label `truncate`s and the value uses tabular-nums so width never
 * jitters as the percentage changes.
 */
function VerticalChannelStrip({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-[40px] flex-1 flex-col items-center gap-2 px-1 py-2">
      <div className="w-full truncate text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
        {label}
      </div>
      <div className="flex w-3 flex-1 min-h-0 items-stretch justify-center">
        <SliderTrack
          value={value}
          onChange={onChange}
          orientation="vertical"
          ariaLabel={`${label} volume`}
        />
      </div>
      <div className="text-[10px] font-medium tabular-nums text-white/65">{value}%</div>
    </div>
  );
}

/**
 * Horizontal channel row — label on the left, fader in the middle, value on the right.
 *
 * Sizing mirrors the vertical mode's "fill the dock" behaviour, but on the perpendicular axis:
 *   - `flex-1 min-h-[36px]` makes every row share the dock's available *height* evenly. Two
 *     channels → each row is half the dock tall; eight channels → each row is one-eighth. The
 *     `min-h` floor keeps rows usable when there are enough channels to overflow.
 *   - Label and value stay at fixed widths (`w-16`, `w-9`) so multiple rows visually align into
 *     clean columns. The slider takes everything else via `flex-1`, so the fader stretches to
 *     fill the dock *width* the same way strips do in vertical mode.
 *
 * The slider's track is `h-1` (4 px); `items-center` parks it vertically in the middle of each
 * stretched row regardless of how tall the row gets.
 */
function HorizontalChannelStrip({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex w-full min-h-[36px] flex-1 items-center gap-3 px-2 py-2">
      <div className="w-16 shrink-0 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
        {label}
      </div>
      <div className="flex h-3 flex-1 items-center">
        <SliderTrack
          value={value}
          onChange={onChange}
          orientation="horizontal"
          ariaLabel={`${label} volume`}
        />
      </div>
      <div className="w-9 shrink-0 text-right text-[10px] font-medium tabular-nums text-white/65">
        {value}%
      </div>
    </div>
  );
}

/**
 * Toggle in the DockShell header that flips the mixer between vertical column strips and
 * horizontal rows. Icon mirrors the resulting layout: `Columns3` while horizontal (clicking it
 * goes to columns), `Rows3` while vertical (clicking goes to rows).
 */
function OrientationToggle({
  orientation,
  onToggle
}: {
  orientation: Orientation;
  onToggle: () => void;
}) {
  const nextLabel = orientation === "vertical" ? "horizontal" : "vertical";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`Switch to ${nextLabel} layout`}
      title={`Switch to ${nextLabel} layout`}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
    >
      {orientation === "vertical" ? <Rows3 className="h-3.5 w-3.5" /> : <Columns3 className="h-3.5 w-3.5" />}
    </button>
  );
}

export function SoundMixerDock({
  dragHandleProps,
  onClose,
  dockLocked,
  onToggleDockLock
}: {
  dragHandleProps?: any;
  onClose?: () => void;
  dockLocked?: boolean;
  onToggleDockLock?: () => void;
}) {
  const [master, setMaster] = React.useState(88);
  const [music, setMusic] = React.useState(45);
  const [tts, setTts] = React.useState(68);
  const [fx, setFx] = React.useState(38);

  // Adding a channel here automatically slots it into either layout — both the vertical row of
  // strips and the horizontal stack of rows iterate this list directly.
  const channels: Channel[] = [
    { key: "master", label: "MASTER", value: master, setValue: setMaster },
    { key: "music", label: "MUSIC", value: music, setValue: setMusic },
    { key: "tts", label: "TTS", value: tts, setValue: setTts },
    { key: "fx", label: "FX", value: fx, setValue: setFx }
  ];

  /**
   * Persisted orientation preference. Lazy-init from `localStorage` so the first render uses the
   * saved value (no flash of default layout), with a guard for SSR where `window` is undefined.
   * Writing happens in a separate effect to avoid touching storage on every render.
   */
  const [orientation, setOrientation] = React.useState<Orientation>(() => {
    if (typeof window === "undefined") return "vertical";
    const saved = window.localStorage.getItem(ORIENTATION_STORAGE_KEY);
    return saved === "horizontal" ? "horizontal" : "vertical";
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem(ORIENTATION_STORAGE_KEY, orientation);
    } catch {
      /* storage quota or disabled — non-fatal */
    }
  }, [orientation]);

  const toggleOrientation = React.useCallback(() => {
    setOrientation((prev) => (prev === "vertical" ? "horizontal" : "vertical"));
  }, []);

  return (
    <DockShell
      title="Sound Mixer"
      right={<OrientationToggle orientation={orientation} onToggle={toggleOrientation} />}
      dragHandleProps={dragHandleProps}
      onClose={onClose}
      dockLocked={dockLocked}
      onToggleDockLock={onToggleDockLock}
    >
      {/*
       * Both layouts cancel a chunk of `DockShell`'s `p-4` padding with negative margins so the
       * strips/rows can stretch toward the dock edges without changing the shared shell. Hairline
       * separators (`divide-x` for vertical, `divide-y` for horizontal) keep visual structure
       * without bulky borders.
       */}
      {orientation === "vertical" ? (
        <div className="-mx-2 -my-2 flex h-full divide-x divide-white/[0.04]">
          {channels.map((c) => (
            <VerticalChannelStrip
              key={c.key}
              label={c.label}
              value={c.value}
              onChange={c.setValue}
            />
          ))}
        </div>
      ) : (
        <div className="-mx-2 -my-2 flex h-full flex-col divide-y divide-white/[0.04] overflow-y-auto">
          {channels.map((c) => (
            <HorizontalChannelStrip
              key={c.key}
              label={c.label}
              value={c.value}
              onChange={c.setValue}
            />
          ))}
        </div>
      )}
    </DockShell>
  );
}
