/**
 * Returns the credentials a browser needs to open a Twitch IRC WebSocket for the selected channel.
 *
 * We need three things on the client to call `JOIN`:
 *   - `accessToken` — the user's Twitch OAuth token, used as the IRC `PASS oauth:<token>`. Twitch
 *     IRC has no other auth mechanism; bearer tokens go over the WS handshake. Since the WS lives
 *     in the browser, the token unavoidably reaches the client — same trust model as if the user
 *     ran an external chat client (e.g. Chatty/ChatTerminal) with their own OAuth token.
 *   - `userLogin` — the bearer's own Twitch login (lowercase) for the IRC `NICK`. Resolved via
 *     `GET /helix/users` (returns the authed user when called without params).
 *   - `channelLogin` — the broadcaster's lowercase login for the IRC `JOIN #<channel>`. Resolved
 *     via `GET /helix/users?id=<broadcaster_id>`.
 *
 * Access control mirrors `channel-info`: caller must be the broadcaster or hold a row in
 * `ChannelPermission` for that channel. Otherwise 403.
 *
 * Token validation: if `/oauth2/validate` says the token is bad, we force a refresh once before
 * giving up, so a Twitch-side reconnect doesn't immediately bounce the browser out of chat.
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { forceRefreshProviderToken, getProviderAccessToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function twitchHeaders(accessToken: string): Record<string, string> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) throw new Error("Missing TWITCH_CLIENT_ID");
  return {
    Authorization: `Bearer ${accessToken}`,
    "Client-Id": clientId
  };
}

async function tokenIsValid(accessToken: string): Promise<boolean> {
  try {
    const r = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${accessToken}` },
      cache: "no-store"
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function fetchHelixUserLogin(accessToken: string, idOrSelf: { id?: string }): Promise<string | null> {
  const url = idOrSelf.id
    ? `https://api.twitch.tv/helix/users?id=${encodeURIComponent(idOrSelf.id)}`
    : "https://api.twitch.tv/helix/users";
  const res = await fetch(url, { headers: twitchHeaders(accessToken), cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { login?: string }[] };
  return json.data?.[0]?.login ?? null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  if (!channelTwitchId) {
    return Response.json({ error: "Missing channelTwitchId" }, { status: 400 });
  }

  const twAcc = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "twitch" },
    select: { providerAccountId: true }
  });
  const isSelf = twAcc?.providerAccountId === channelTwitchId;

  if (!isSelf) {
    const perm = await prisma.channelPermission.findUnique({
      where: { userId_channelTwitchId: { userId: session.user.id, channelTwitchId } },
      select: { role: true }
    });
    if (!perm) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let accessToken: string;
  try {
    ({ accessToken } = await getProviderAccessToken(session.user.id, "twitch"));
  } catch {
    return Response.json({ error: "No Twitch token; sign in again." }, { status: 401 });
  }

  if (!(await tokenIsValid(accessToken))) {
    try {
      const refreshed = await forceRefreshProviderToken(session.user.id, "twitch");
      accessToken = refreshed.accessToken;
    } catch {
      return Response.json(
        { error: "Twitch token is revoked. Sign out and sign in again." },
        { status: 401 }
      );
    }
  }

  const userLogin = await fetchHelixUserLogin(accessToken, {});
  if (!userLogin) {
    return Response.json({ error: "Could not resolve your Twitch login." }, { status: 502 });
  }

  let channelLogin = userLogin;
  if (!isSelf) {
    const ch = await fetchHelixUserLogin(accessToken, { id: channelTwitchId });
    if (!ch) {
      return Response.json({ error: "Could not resolve channel login." }, { status: 502 });
    }
    channelLogin = ch;
  }

  return Response.json({
    accessToken,
    userLogin,
    channelLogin,
    isSelf
  });
}
