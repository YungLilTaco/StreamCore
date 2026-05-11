/**
 * Returns the profile data needed to render the Twitch-style user popover.
 *
 * Inputs (query string):
 *   - `login` or `id` — at least one is required. If only `login` is given we resolve to an `id`
 *     via `helix/users?login=X`. Logins are lowercase, ASCII; display names can differ.
 *   - `channelTwitchId` — the broadcaster we're moderating in. Determines which relationship
 *     queries (follow, sub, ban) are made.
 *
 * Output: `{ user, follow: { followedAt } | null, subscription: { tier, isGift } | null,
 *           ban: { bannedAt, expiresAt | null, reason } | null }`.
 *
 * Each side-channel lookup degrades to `null` if Twitch refuses (scope missing, not affiliate,
 * not a moderator in that channel, etc.) — we never error the whole request because a single
 * lookup failed. Diagnostics live on the response under `warnings: string[]` for the UI to surface.
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProviderAccessToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HelixUser = {
  id: string;
  login: string;
  display_name: string;
  type?: "" | "staff" | "admin" | "global_mod";
  broadcaster_type?: "" | "partner" | "affiliate";
  description?: string;
  profile_image_url?: string;
  offline_image_url?: string;
  created_at?: string;
};

function twitchHeaders(token: string): Record<string, string> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) throw new Error("Missing TWITCH_CLIENT_ID");
  return { Authorization: `Bearer ${token}`, "Client-Id": clientId };
}

async function helixGet<T = unknown>(url: string, token: string): Promise<{ ok: boolean; status: number; json: T | null }> {
  try {
    const r = await fetch(url, { headers: twitchHeaders(token), cache: "no-store" });
    const json = r.ok ? ((await r.json()) as T) : null;
    return { ok: r.ok, status: r.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const login = url.searchParams.get("login");
  const idParam = url.searchParams.get("id");
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  if (!login && !idParam) {
    return Response.json({ error: "Missing login or id" }, { status: 400 });
  }
  if (!channelTwitchId) {
    return Response.json({ error: "Missing channelTwitchId" }, { status: 400 });
  }

  // Access check mirrors chat-credentials: must be self or hold a ChannelPermission.
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
    if (!perm) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let accessToken: string;
  try {
    ({ accessToken } = await getProviderAccessToken(session.user.id, "twitch"));
  } catch {
    return Response.json({ error: "No Twitch token" }, { status: 401 });
  }

  // 1. Resolve user.
  const userUrl = idParam
    ? `https://api.twitch.tv/helix/users?id=${encodeURIComponent(idParam)}`
    : `https://api.twitch.tv/helix/users?login=${encodeURIComponent((login as string).toLowerCase())}`;
  const userRes = await helixGet<{ data?: HelixUser[] }>(userUrl, accessToken);
  if (!userRes.ok || !userRes.json?.data?.length) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  const user = userRes.json.data[0]!;

  const warnings: string[] = [];

  // 2. Follow date (mod scope required; degrades to null if not granted/permitted).
  const followRes = await helixGet<{ data?: { followed_at: string }[] }>(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${encodeURIComponent(channelTwitchId)}&user_id=${encodeURIComponent(user.id)}`,
    accessToken
  );
  let follow: { followedAt: string } | null = null;
  if (followRes.ok) {
    const followedAt = followRes.json?.data?.[0]?.followed_at;
    if (followedAt) follow = { followedAt };
  } else if (followRes.status === 401 || followRes.status === 403) {
    warnings.push("Follow date hidden — missing moderator:read:followers scope.");
  }

  // 3. Subscription (own-channel only with channel:read:subscriptions). Tier comes back but not months.
  let subscription: { tier: string; isGift: boolean } | null = null;
  if (isSelf) {
    const subRes = await helixGet<{
      data?: { tier: string; is_gift: boolean; gifter_name?: string }[];
    }>(
      `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${encodeURIComponent(channelTwitchId)}&user_id=${encodeURIComponent(user.id)}`,
      accessToken
    );
    if (subRes.ok) {
      const s = subRes.json?.data?.[0];
      if (s) subscription = { tier: s.tier, isGift: !!s.is_gift };
    } else if (subRes.status === 401 || subRes.status === 403) {
      warnings.push("Sub status hidden — missing channel:read:subscriptions or not Affiliate.");
    }
    // 404 = not subscribed; that's the common case, no warning needed.
  }

  // 4. Ban status (active ban or timeout). `moderator:manage:banned_users` covers both read+manage.
  const banRes = await helixGet<{
    data?: { user_id: string; created_at: string; expires_at: string | null; reason: string | null }[];
  }>(
    `https://api.twitch.tv/helix/moderation/banned?broadcaster_id=${encodeURIComponent(channelTwitchId)}&user_id=${encodeURIComponent(user.id)}`,
    accessToken
  );
  let ban: { bannedAt: string; expiresAt: string | null; reason: string | null } | null = null;
  if (banRes.ok) {
    const b = banRes.json?.data?.[0];
    if (b) ban = { bannedAt: b.created_at, expiresAt: b.expires_at, reason: b.reason };
  } else if (banRes.status === 401 || banRes.status === 403) {
    warnings.push("Ban status hidden — missing moderator:manage:banned_users scope.");
  }

  return Response.json({
    user: {
      id: user.id,
      login: user.login,
      displayName: user.display_name,
      type: user.type || null,
      broadcasterType: user.broadcaster_type || null,
      description: user.description || null,
      profileImageUrl: user.profile_image_url || null,
      createdAt: user.created_at || null
    },
    follow,
    subscription,
    ban,
    warnings
  });
}
