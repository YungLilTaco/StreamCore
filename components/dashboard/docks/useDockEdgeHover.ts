"use client";

import * as React from "react";

/** Toggle `sv-dock-edge-active` on the root so RGL resize handles only capture pointer near the dock border. */
export function useDockEdgeHover(edgePx = 12) {
  const ref = React.useRef<HTMLDivElement>(null);

  const onMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const near =
        x < edgePx || y < edgePx || x > r.width - edgePx || y > r.height - edgePx;
      el.classList.toggle("sv-dock-edge-active", near);
    },
    [edgePx]
  );

  const onMouseLeave = React.useCallback(() => {
    ref.current?.classList.remove("sv-dock-edge-active");
  }, []);

  return { ref, onMouseMove, onMouseLeave };
}
