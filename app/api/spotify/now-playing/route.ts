import { auth } from "@/auth";
import { getProviderAccessToken } from "@/lib/tokens";

/**
 * Proxies Spotify `GET /v1/me/player/currently-playing` for the signed-in user.
 * Errors are JSON so clients can show a message instead of an opaque HTTP 500.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ message: "Unauthorized", code: "unauthorized" }, { status: 401 });
    }

    let accessToken: string;
    try {
      const t = await getProviderAccessToken(session.user.id, "spotify");
      accessToken = t.accessToken;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "No Spotify account linked for this user.";
      return Response.json(
        {
          message:
            /no spotify account linked/i.test(message) || /spotify account linked/i.test(message)
              ? "Link Spotify in Settings to see now playing and use playback controls."
              : message,
          code: "spotify_not_linked"
        },
        { status: 403 }
      );
    }

    const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    });

    if (res.status === 204) {
      return new Response(null, { status: 204 });
    }

    const bodyText = await res.text();
    if (!res.ok) {
      let detail = bodyText.slice(0, 280);
      try {
        const j = JSON.parse(bodyText) as { error?: { message?: string } };
        if (j?.error?.message) detail = j.error.message;
      } catch {
        /* use raw slice */
      }
      return Response.json(
        {
          message: detail || `Spotify returned ${res.status}`,
          code: "spotify_api"
        },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }

    return new Response(bodyText, {
      status: 200,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return Response.json({ message, code: "internal" }, { status: 500 });
  }
}
