import { auth } from "@/auth";
import { getProviderAccessToken } from "@/lib/tokens";

function twitchHeaders(accessToken: string) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) throw new Error("Missing TWITCH_CLIENT_ID");
  return {
    Authorization: `Bearer ${accessToken}`,
    "Client-Id": clientId
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized", data: [] }, { status: 401 });
  }

  const url = new URL(req.url);
  const query = (url.searchParams.get("query") ?? "").trim();
  if (!query) return Response.json({ data: [] });

  const { accessToken } = await getProviderAccessToken(session.user.id, "twitch");
  const headers = twitchHeaders(accessToken);

  const res = await fetch(
    `https://api.twitch.tv/helix/search/categories?first=10&query=${encodeURIComponent(query)}`,
    { headers, cache: "no-store" }
  );

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" }
  });
}

