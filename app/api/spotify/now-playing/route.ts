import { auth } from "@/auth";
import { getProviderAccessToken } from "@/lib/tokens";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { accessToken } = await getProviderAccessToken(session.user.id, "spotify");

  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });

  if (res.status === 204) return new Response(null, { status: 204 });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" }
  });
}

