"use client";

import { useSyncExternalStore } from "react";

/**
 * Subscribes to `document.body.dataset.dragging` (set by `DashboardGrid` while a dock is being
 * moved or resized).
 *
 * Why this exists: docks that animate their inner contents — most notably the activity feed,
 * which uses framer-motion's `layout` prop on every row so list reorders glide rather than
 * teleport — re-measure their bounding rect on every render. When the parent dock is being
 * dragged its transform shifts every frame, so the inner rows see "my viewport position
 * changed" and kick off a fresh spring animation toward the new spot. The result is the
 * rubber-band effect the user reported: contents trail behind the dock card itself.
 *
 * We can't disable framer-motion's animations globally, but we *can* tell individual
 * `<motion.*>` nodes to skip the layout reflow while a gesture is active. This hook gives
 * those nodes the signal they need to do that. It uses `useSyncExternalStore` so we stay
 * concurrent-mode safe and tear-free across renders.
 */

function subscribe(callback: () => void) {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-dragging", "data-resize-axis"]
  });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  if (typeof document === "undefined") return false;
  const ds = document.body.dataset;
  return ds.dragging === "1" || typeof ds.resizeAxis === "string";
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Returns `true` while any dock on the page is being dragged or resized.
 *
 * Nested components should use this to short-circuit framer-motion `layout` animations,
 * heavy effects, or anything else that would interfere with the dock card's pixel-precise
 * transform during a gesture.
 */
export function useIsAnyDockDragging(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
