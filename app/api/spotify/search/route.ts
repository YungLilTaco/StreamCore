import { auth } from "@/auth";
import { getProviderAccessToken } from "@/lib/tokens";
import { resolveSpotifyTrackFromQuery, searchSpotifyTracks } from "@/lib/spotify-track-search";
import { extractSpotifyTrackUri } from "@/lib/spotify-track-uri";

/**
 * GET /api/spotify/search?q=…&limit=5
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ message: "Missing q" }, { status: 400 });
  const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit")) || 5));

  const { accessToken } = await getProviderAccessToken(session.user.id, "spotify");

  if (extractSpotifyTrackUri(q)) {
    const one = await resolveSpotifyTrackFromQuery(accessToken, q);
    if (!one) return Response.json({ tracks: [] });
    return Response.json({
      tracks: [{ id: one.id, name: one.title, uri: one.uri, artists: one.artist.split(", ") }]
    });
  }

  const hits = await searchSpotifyTracks(accessToken, q, limit);
  return Response.json({
    tracks: hits.map((h) => ({
      id: h.id,
      name: h.title,
      uri: h.uri,
      artists: h.artist.split(", ")
    }))
  });
}
