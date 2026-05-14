import { NowPlayingAnimationClient } from "./now-playing-animation-client";

/**
 * OBS browser-source page for the animated "Now Playing" widget.
 *
 * IMPORTANT: this page intentionally does NOT use `AppPage`. OBS captures the entire viewport
 * pixel-for-pixel and chroma-keys against transparent black, so any app chrome (header,
 * sidebar, card backgrounds) would bleed into the stream. The whole document is rendered with
 * `background: transparent` so the only visible pixels are the widget itself.
 */
export default function Page() {
  return <NowPlayingAnimationClient />;
}
