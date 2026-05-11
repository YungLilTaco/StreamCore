/**
 * One-shot historical backfill for `ChatMessageArchive`.
 *
 * Twitch's Helix API has no read endpoint for chat history. The closest available source is the
 * community-run buffer at <https://recent-messages.robotty.de>, which retains the last ~800 IRC
 * lines per channel. We fetch that, parse each PRIVMSG with the same `parseIrcLine` utility the
 * live chat hook uses, and bulk-insert into the archive with `skipDuplicates` so calling this
 * repeatedly is safe.
 *
 * Backfill is best-effort:
 *   - If the recent-messages server is down or rate-limits us, we return a `partial: true`
 *     response and the live IRC stream still keeps the archive growing.
 *   - Channels that have never been observed by recent-messages produce an empty array.
 *
 * Access policy mirrors the regular archive: caller must be `isSelf` on the channel or hold a
 * `ChannelPermission` row.
 *
 * Throttling: callers should self-limit (we do once per channel per hour on the client). Server
 * does no caching beyond standard fetch semantics.
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseIrcLine } from "@/lib/twitch-irc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECENT_MESSAGES_LIMIT = 800;

type Body = { channelTwitchId?: unknown };

async function assertChannelAccess(userId: string, channelTwitchId: string): Promise<boolean> {
  const own = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true }
  });
  if (own?.providerAccountId === channelTwitchId) return true;
  const perm = await prisma.channelPermission.findUnique({
    where: { userId_channelTwitchId: { userId, channelTwitchId } },
    select: { role: true }
  });
  return !!perm;
}

/** Map the broadcaster's twitch id to their lowercase login (recent-messages keys by login). */
async function resolveChannelLogin(twitchId: string): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    // App-token flow is enough here — `helix/users` accepts app tokens for public profile data.
    const tokRes = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials"
      }),
      cache: "no-store"
    });
    if (!tokRes.ok) return null;
    const tok = (await tokRes.json()) as { access_token?: string };
    if (!tok.access_token) return null;
    const userRes = await fetch(`https://api.twitch.tv/helix/users?id=${encodeURIComponent(twitchId)}`, {
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        "Client-Id": clientId
      },
      cache: "no-store"
    });
    if (!userRes.ok) return null;
    const userJson = (await userRes.json()) as { data?: { login: string }[] };
    return userJson.data?.[0]?.login?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelTwitchId = typeof body.channelTwitchId === "string" ? body.channelTwitchId : null;
  if (!channelTwitchId) return Response.json({ error: "Missing channelTwitchId" }, { status: 400 });

  const ok = await assertChannelAccess(session.user.id, channelTwitchId);
  if (!ok) return Response.json({ error: "Forbidden" }, { status: 403 });

  const channelLogin = await resolveChannelLogin(channelTwitchId);
  if (!channelLogin) {
    return Response.json({ inserted: 0, partial: true, error: "Could not resolve channel login" });
  }

  let lines: string[] = [];
  try {
    const url = new URL(`https://recent-messages.robotty.de/api/v2/recent-messages/${channelLogin}`);
    url.searchParams.set("limit", String(RECENT_MESSAGES_LIMIT));
    // Skip CLEARCHAT / NOTICE / etc — we only want PRIVMSGs (mapped to NOTICE elsewhere isn't useful here).
    url.searchParams.set("clearchat_to_notice", "false");
    const rmRes = await fetch(url.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!rmRes.ok) {
      return Response.json({
        inserted: 0,
        partial: true,
        error: `recent-messages server returned HTTP ${rmRes.status}`
      });
    }
    const rmJson = (await rmRes.json()) as { messages?: unknown[]; error_code?: string | null };
    lines = (rmJson.messages ?? []).filter((m): m is string => typeof m === "string");
  } catch (e: unknown) {
    return Response.json({
      inserted: 0,
      partial: true,
      error: (e as Error).message || "recent-messages fetch failed"
    });
  }

  type ArchiveInput = {
    channelTwitchId: string;
    ircId: string;
    userTwitchId: string | null;
    userLogin: string;
    displayName: string;
    color: string | null;
    text: string;
    badges: string | null;
    ts: bigint;
    isMod: boolean;
    isSubscriber: boolean;
  };

  const cleaned: ArchiveInput[] = [];
  const seenIrcIds = new Set<string>();
  for (const line of lines) {
    const parsed = parseIrcLine(line);
    if (!parsed || parsed.command !== "PRIVMSG") continue;
    const t = parsed.tags ?? {};
    const ircId = t["id"];
    if (!ircId || seenIrcIds.has(ircId)) continue;
    seenIrcIds.add(ircId);

    const userLogin = (parsed.nick || "").toLowerCase();
    const text = parsed.trailing ?? "";
    const tsRaw = Number(t["tmi-sent-ts"]);
    if (!userLogin || !text || !Number.isFinite(tsRaw) || tsRaw <= 0) continue;

    const badges = t["badges"] || "";
    cleaned.push({
      channelTwitchId,
      ircId: ircId.slice(0, 64),
      userTwitchId: t["user-id"] ? t["user-id"]!.slice(0, 32) : null,
      userLogin: userLogin.slice(0, 64),
      displayName: (t["display-name"] || parsed.nick || userLogin).slice(0, 64),
      color: t["color"] ? t["color"]!.slice(0, 16) : null,
      text: text.slice(0, 1000),
      badges: badges ? badges.slice(0, 256) : null,
      ts: BigInt(Math.floor(tsRaw)),
      isMod: t["mod"] === "1" || badges.includes("moderator/") || badges.includes("broadcaster/"),
      isSubscriber: t["subscriber"] === "1" || badges.includes("subscriber/")
    });
  }

  if (cleaned.length === 0) return Response.json({ inserted: 0, partial: false });

  /**
   * `createMany({ skipDuplicates: true })` against the `(channelTwitchId, ircId)` unique index lets
   * Postgres ignore rows we've already archived from the live stream — no per-row try/catch needed.
   */
  const result = await prisma.chatMessageArchive.createMany({
    data: cleaned,
    skipDuplicates: true
  });

  return Response.json({ inserted: result.count, partial: false, scanned: cleaned.length });
}
