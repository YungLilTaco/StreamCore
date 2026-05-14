import { auth } from "@/auth";
import { getProviderAccessToken } from "@/lib/tokens";

/**
 * GET /api/spotify/search?q=…&limit=5
 *
 * Returns `{ tracks: [{ id, name, artists, uri }] }` for the signed-in user's Spotify account.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ message: "Missing q" }, { status: 400 });
  const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit")) || 5));

  const { accessToken } = await getProviderAccessToken(session.user.id, "spotify");

  const qs = new URLSearchParams({
    q,
    type: "track",
    limit: String(limit)
  });
  const res = await fetch(`https://api.spotify.com/v1/search?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!res.ok) {
    const t = await res.text();
    return Response.json({ message: t || `Spotify ${res.status}` }, { status: res.status });
  }
  const json = (await res.json()) as {
    tracks?: {
      items?: {
        id: string;
        name: string;
        uri: string;
        artists?: { name: string }[];
      }[];
    };
  };
  const items = json.tracks?.items ?? [];
  const tracks = items.map((it) => ({
    id: it.id,
    name: it.name,
    uri: it.uri,
    artists: (it.artists ?? []).map((a) => a.name).filter(Boolean)
  }));
  return Response.json({ tracks });
}
