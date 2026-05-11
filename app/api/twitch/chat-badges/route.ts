/**
 * Returns Twitch chat badge images for a channel, merged from global + channel sets.
 *
 * Twitch publishes badges through two Helix endpoints:
 *  - `GET /helix/chat/badges/global` — Twitch-wide badge sets (`moderator`, `vip`, `broadcaster`,
 *    `staff`, `admin`, `verified`, `partner`, `turbo`, `premium`, `bits`, `predictions`, …).
 *  - `GET /helix/chat/badges?broadcaster_id=X` — that channel's CUSTOM versions, typically for
 *    `subscriber` (per-month variants) and `bits` (per-tier variants). Empty if the broadcaster
 *    hasn't uploaded any custom badges.
 *
 * Both endpoints return the same shape: `data: [{ set_id, versions: [{ id, image_url_1x, _2x, _4x, title }] }]`.
 * We collapse them into a flat `set_id → version_id → { url, title }` map; channel badges
 * overlay global ones so a subscriber's custom 12-month badge wins over the default.
 *
 * The IRC `badges` tag uses the same identifiers: `subscriber/12,moderator/1,bits/1000`. The
 * client just splits the tag and looks each pair up in this map.
 */

import { auth } from "@/auth";
import { getProviderAccessToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HelixBadgeSet = {
  set_id: string;
  versions: {
    id: string;
    image_url_1x?: string;
    image_url_2x?: string;
    image_url_4x?: string;
    title?: string;
  }[];
};

type HelixBadgeResponse = { data?: HelixBadgeSet[] };

export type ChatBadgeMap = Record<string, Record<string, { url: string; title: string }>>;

function twitchHeaders(accessToken: string): Record<string, string> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) throw new Error("Missing TWITCH_CLIENT_ID");
  return {
    Authorization: `Bearer ${accessToken}`,
    "Client-Id": clientId
  };
}

function mergeInto(map: ChatBadgeMap, payload: HelixBadgeResponse): void {
  for (const set of payload.data ?? []) {
    const bucket = map[set.set_id] ?? {};
    for (const v of set.versions ?? []) {
      const url = v.image_url_2x || v.image_url_4x || v.image_url_1x;
      if (!url) continue;
      bucket[v.id] = { url, title: v.title || `${set.set_id}/${v.id}` };
    }
    map[set.set_id] = bucket;
  }
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

  let accessToken: string;
  try {
    ({ accessToken } = await getProviderAccessToken(session.user.id, "twitch"));
  } catch {
    return Response.json({ error: "No Twitch token" }, { status: 401 });
  }

  const headers = twitchHeaders(accessToken);

  const [globalRes, channelRes] = await Promise.all([
    fetch("https://api.twitch.tv/helix/chat/badges/global", { headers, cache: "no-store" }),
    fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${encodeURIComponent(channelTwitchId)}`, {
      headers,
      cache: "no-store"
    })
  ]);

  const badges: ChatBadgeMap = {};
  if (globalRes.ok) {
    mergeInto(badges, (await globalRes.json()) as HelixBadgeResponse);
  }
  if (channelRes.ok) {
    // Channel-specific definitions overlay global ones.
    mergeInto(badges, (await channelRes.json()) as HelixBadgeResponse);
  }

  return new Response(JSON.stringify({ channelTwitchId, badges }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Badges almost never change for a given channel; let the browser hold this for 10 minutes.
      "Cache-Control": "private, max-age=600"
    }
  });
}
