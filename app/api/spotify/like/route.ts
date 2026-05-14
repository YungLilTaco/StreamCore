import { auth } from "@/auth";
import { getProviderAccessToken } from "@/lib/tokens";

/**
 * Heart / unheart the current (or a specific) Spotify track.
 *
 * GET  /api/spotify/like?id=<trackId>     → { liked: boolean }   (uses /me/tracks/contains)
 * POST /api/spotify/like                  → body: { id: string, liked: boolean }
 *                                            PUT  /me/tracks?ids=… when `liked: true`
 *                                            DELETE /me/tracks?ids=… when `liked: false`
 *
 * The two-step `contains` → `PUT|DELETE` flow is required: Spotify's Web API has no
 * "toggle" verb. The dock keeps its own optimistic state, but on first load it calls the
 * GET form to render the correct filled-heart visual.
 */

function validTrackId(s: unknown): s is string {
  // Spotify track IDs are 22 alphanumeric chars (base62). We accept anything matching that shape;
  // anything else short-circuits with a 400 so we don't forward malformed IDs to the upstream.
  return typeof s === "string" && /^[A-Za-z0-9]{22}$/.test(s);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!validTrackId(id)) return Response.json({ message: "Missing or invalid track id" }, { status: 400 });

  const { accessToken } = await getProviderAccessToken(session.user.id, "spotify");

  const res = await fetch(`https://api.spotify.com/v1/me/tracks/contains?ids=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (res.status === 401 || res.status === 403) {
    return Response.json(
      {
        message: "Reconnect Spotify with library scopes (user-library-read, user-library-modify).",
        code: "scope_required"
      },
      { status: res.status }
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json({ message: text || `Spotify ${res.status}` }, { status: res.status });
  }
  const arr = (await res.json().catch(() => null)) as boolean[] | null;
  return Response.json({ liked: Boolean(arr?.[0]) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: string; liked?: boolean } | null;
  if (!validTrackId(body?.id)) return Response.json({ message: "Missing or invalid track id" }, { status: 400 });
  if (typeof body?.liked !== "boolean") return Response.json({ message: "liked must be a boolean" }, { status: 400 });

  const { accessToken } = await getProviderAccessToken(session.user.id, "spotify");

  const url = `https://api.spotify.com/v1/me/tracks?ids=${encodeURIComponent(body.id!)}`;
  const res = await fetch(url, {
    method: body.liked ? "PUT" : "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (res.status === 401 || res.status === 403) {
    return Response.json(
      {
        message: "Reconnect Spotify with library scopes (user-library-read, user-library-modify).",
        code: "scope_required"
      },
      { status: res.status }
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json({ message: text || `Spotify ${res.status}` }, { status: res.status });
  }
  return Response.json({ ok: true, liked: body.liked });
}
