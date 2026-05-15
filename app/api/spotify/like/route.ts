import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { spotifyAccountHasLibraryScopes } from "@/lib/spotify-oauth";
import {
  spotifyApiErrorMessage,
  spotifyLibraryFetch,
  spotifyTrackIsSaved,
  spotifyTrackUri
} from "@/lib/spotify-library-api";
import { forceRefreshProviderToken, getProviderAccessToken } from "@/lib/tokens";

async function assertLibraryScopes(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "spotify" },
    select: { scope: true }
  });
  if (!account) {
    return Response.json({ message: "Spotify not linked", code: "not_linked" }, { status: 401 });
  }
  if (!spotifyAccountHasLibraryScopes(account.scope)) {
    return Response.json(
      {
        message:
          "Reconnect Spotify and approve library access (user-library-read, user-library-modify).",
        code: "scope_required"
      },
      { status: 403 }
    );
  }
  return null;
}

function validTrackId(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9]{22}$/.test(s);
}

/** Current Spotify Web API — save/remove tracks via `/me/library` (not deprecated query-string `/me/tracks`). */
function libraryUrl(trackId: string): string {
  return `https://api.spotify.com/v1/me/library?uris=${encodeURIComponent(spotifyTrackUri(trackId))}`;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!validTrackId(id)) return Response.json({ message: "Missing or invalid track id" }, { status: 400 });

  const scopeErr = await assertLibraryScopes(session.user.id);
  if (scopeErr) return scopeErr;

  const liked = await spotifyTrackIsSaved(
    session.user.id,
    id,
    (uid) => getProviderAccessToken(uid, "spotify"),
    (uid) => forceRefreshProviderToken(uid, "spotify")
  );

  if (liked === null) {
    return Response.json({ liked: null, unknown: true });
  }
  return Response.json({ liked });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: string; liked?: boolean } | null;
  if (!validTrackId(body?.id)) return Response.json({ message: "Missing or invalid track id" }, { status: 400 });
  if (typeof body?.liked !== "boolean") return Response.json({ message: "liked must be a boolean" }, { status: 400 });

  const scopeErr = await assertLibraryScopes(session.user.id);
  if (scopeErr) return scopeErr;

  const url = libraryUrl(body.id!);
  const { response: res } = await spotifyLibraryFetch(
    session.user.id,
    url,
    { method: body.liked ? "PUT" : "DELETE" },
    (uid) => getProviderAccessToken(uid, "spotify"),
    (uid) => forceRefreshProviderToken(uid, "spotify")
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json(
      { message: spotifyApiErrorMessage(detail, res.status), code: "spotify_api" },
      { status: res.status }
    );
  }
  return Response.json({ ok: true, liked: body.liked });
}
