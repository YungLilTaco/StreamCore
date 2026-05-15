import { extractSpotifyTrackUri, spotifyTrackIdFromUri } from "@/lib/spotify-track-uri";

export type SpotifyTrackHit = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  /** 0–1 relevance score for ranking search results. */
  score: number;
};

type SpotifyApiTrack = {
  id?: string;
  name?: string;
  uri?: string;
  artists?: { name?: string }[];
  popularity?: number;
};

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split "Artist - Title", "Title by Artist", or "Artist, Title". */
export function parseArtistAndTitle(raw: string): { artist: string | null; title: string } {
  const t = raw.trim();
  if (!t) return { artist: null, title: "" };

  const by = /\s+by\s+/i.exec(t);
  if (by && by.index > 0) {
    return {
      title: t.slice(0, by.index).trim(),
      artist: t.slice(by.index + by[0].length).trim() || null
    };
  }

  const dash = t.match(/^(.+?)\s*[-–—]\s+(.+)$/);
  if (dash) {
    const left = dash[1].trim();
    const right = dash[2].trim();
    if (left.length >= 2 && right.length >= 2) return { artist: left, title: right };
  }

  const comma = t.match(/^(.+?),\s*(.+)$/);
  if (comma) {
    const a = comma[1].trim();
    const b = comma[2].trim();
    if (a.length >= 2 && b.length >= 2) return { artist: a, title: b };
  }

  return { artist: null, title: t };
}

function buildSearchQuery(raw: string): string {
  const { artist, title } = parseArtistAndTitle(raw);
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  if (artist && cleanTitle) {
    return `track:${cleanTitle} artist:${artist}`;
  }
  return cleanTitle || raw.trim();
}

function scoreTrack(
  track: SpotifyApiTrack,
  want: { artist: string | null; title: string; raw: string }
): number {
  const name = track.name ?? "";
  const artistNames = (track.artists ?? []).map((a) => a.name ?? "").filter(Boolean);
  const artistJoined = artistNames.join(" ");
  const nTitle = normalizeForMatch(name);
  const nArtist = normalizeForMatch(artistJoined);
  const nWantTitle = normalizeForMatch(want.title);
  const nWantArtist = want.artist ? normalizeForMatch(want.artist) : "";
  const nRaw = normalizeForMatch(want.raw);

  let score = 0;

  if (nWantTitle && nTitle === nWantTitle) score += 0.45;
  else if (nWantTitle && nTitle.includes(nWantTitle)) score += 0.28;
  else if (nWantTitle && nWantTitle.includes(nTitle) && nTitle.length > 3) score += 0.15;

  if (nWantArtist) {
    if (nArtist.includes(nWantArtist) || nWantArtist.includes(nArtist)) score += 0.35;
    else {
      const tokens = nWantArtist.split(" ").filter((x) => x.length > 2);
      const hits = tokens.filter((tok) => nArtist.includes(tok)).length;
      score += (hits / Math.max(1, tokens.length)) * 0.2;
    }
  }

  if (nRaw && (nTitle.includes(nRaw) || nArtist.includes(nRaw))) score += 0.08;

  const pop = typeof track.popularity === "number" ? track.popularity / 100 : 0;
  score += pop * 0.12;

  return Math.min(1, score);
}

const MIN_RELEVANCE = 0.22;

/** Return up to `limit` ranked tracks for UI search (not only the single best match). */
export async function searchSpotifyTracks(
  accessToken: string,
  query: string,
  limit = 5
): Promise<SpotifyTrackHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const parsed = parseArtistAndTitle(trimmed);
  const q = buildSearchQuery(trimmed);
  const qs = new URLSearchParams({ q, type: "track", limit: "10" });
  const r = await fetch(`https://api.spotify.com/v1/search?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!r.ok) return [];

  const j = (await r.json()) as { tracks?: { items?: SpotifyApiTrack[] } };
  const items = j.tracks?.items ?? [];
  const hits: SpotifyTrackHit[] = [];
  for (const it of items) {
    if (!it.uri || !it.id) continue;
    const score = scoreTrack(it, { artist: parsed.artist, title: parsed.title, raw: trimmed });
    if (score < MIN_RELEVANCE) continue;
    hits.push({
      id: it.id,
      uri: it.uri,
      title: it.name?.trim() || "Unknown track",
      artist:
        (it.artists ?? [])
          .map((a) => a.name)
          .filter(Boolean)
          .join(", ") || "Unknown artist",
      score
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

async function fetchTrackById(
  accessToken: string,
  id: string
): Promise<SpotifyTrackHit | null> {
  const r = await fetch(`https://api.spotify.com/v1/tracks/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!r.ok) return null;
  const t = (await r.json()) as SpotifyApiTrack;
  if (!t.uri || !t.id) return null;
  return {
    id: t.id,
    uri: t.uri,
    title: t.name?.trim() || "Unknown track",
    artist:
      (t.artists ?? [])
        .map((a) => a.name)
        .filter(Boolean)
        .join(", ") || "Unknown artist",
    score: 1
  };
}

/**
 * Resolve a pasted URI/link or search text to the best matching Spotify track.
 */
export async function resolveSpotifyTrackFromQuery(
  accessToken: string,
  query: string
): Promise<SpotifyTrackHit | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const fromUri = extractSpotifyTrackUri(trimmed);
  if (fromUri) {
    const id = spotifyTrackIdFromUri(fromUri);
    if (!id) return null;
    return fetchTrackById(accessToken, id);
  }

  const parsed = parseArtistAndTitle(trimmed);
  const q = buildSearchQuery(trimmed);
  const qs = new URLSearchParams({ q, type: "track", limit: "10" });
  const r = await fetch(`https://api.spotify.com/v1/search?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!r.ok) return null;

  const j = (await r.json()) as { tracks?: { items?: SpotifyApiTrack[] } };
  const items = j.tracks?.items ?? [];
  if (!items.length) return null;

  let best: SpotifyTrackHit | null = null;
  for (const it of items) {
    if (!it.uri || !it.id) continue;
    const score = scoreTrack(it, { artist: parsed.artist, title: parsed.title, raw: trimmed });
    const hit: SpotifyTrackHit = {
      id: it.id,
      uri: it.uri,
      title: it.name?.trim() || "Unknown track",
      artist:
        (it.artists ?? [])
          .map((a) => a.name)
          .filter(Boolean)
          .join(", ") || "Unknown artist",
      score
    };
    if (!best || hit.score > best.score) best = hit;
  }

  if (!best || best.score < MIN_RELEVANCE) return null;
  return best;
}
