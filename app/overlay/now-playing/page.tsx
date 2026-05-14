import { NowPlayingAnimationClient } from "@/app/app/now-playing-animation/now-playing-animation-client";

/**
 * OBS browser source URL: `/overlay/now-playing`
 *
 * Same transparent, animated widget as `/app/now-playing-animation`, exposed under a
 * dedicated overlay path for stream setups that prefer a short URL.
 */
export default function OverlayNowPlayingPage() {
  return <NowPlayingAnimationClient />;
}
