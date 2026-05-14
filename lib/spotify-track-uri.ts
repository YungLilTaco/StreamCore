/**
 * Extract `spotify:track:<id>` from common paste shapes (open.spotify.com links, raw URIs).
 */
export function extractSpotifyTrackUri(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const uri = t.match(/^spotify:track:([a-zA-Z0-9]+)$/i);
  if (uri?.[1]) return `spotify:track:${uri[1]}`;
  const m = t.match(/open\.spotify\.com\/(?:intl-[a-z0-9-]+\/)?track\/([a-zA-Z0-9]+)(?:\?|#|$)/i);
  if (m?.[1]) return `spotify:track:${m[1]}`;
  return null;
}

export function spotifyTrackIdFromUri(uri: string): string | null {
  const base = uri.trim().split("?")[0]?.split("#")[0] ?? uri.trim();
  const m = base.match(/^spotify:track:([a-zA-Z0-9]+)$/i);
  return m?.[1] ?? null;
}
