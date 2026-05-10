import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProviderAccessToken } from "@/lib/tokens";

function twitchHeaders(accessToken: string) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) throw new Error("Missing TWITCH_CLIENT_ID");
  return {
    Authorization: `Bearer ${accessToken}`,
    "Client-Id": clientId
  };
}

async function assertCanAccessChannel(userId: string, channelTwitchId: string) {
  const twitchAccount = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true }
  });

  const isSelf = twitchAccount?.providerAccountId === channelTwitchId;
  if (isSelf) return { isSelf: true };

  const perm = await prisma.channelPermission.findUnique({
    where: { userId_channelTwitchId: { userId, channelTwitchId } },
    select: { role: true }
  });

  if (!perm) return null;
  return { isSelf: false, role: perm.role };
}

type ActivityItem = {
  id: string;
  kind: "follow" | "sub" | "gift" | "raid" | "cheer" | "points" | "info";
  text: string;
  at: string;
  ts: number;
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "Recently";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "Recently";
  const diff = Date.now() - t;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(t).toLocaleString();
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  if (!channelTwitchId) return new Response("Missing channelTwitchId", { status: 400 });

  const access = await assertCanAccessChannel(session.user.id, channelTwitchId);
  if (!access) return new Response("Forbidden", { status: 403 });

  const { accessToken } = await getProviderAccessToken(session.user.id, "twitch");
  const headers = twitchHeaders(accessToken);

  const items: ActivityItem[] = [];
  const errors: string[] = [];

  const followersRes = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${encodeURIComponent(channelTwitchId)}&first=15`,
    { headers, cache: "no-store" }
  );
  if (followersRes.ok) {
    const json = (await followersRes.json()) as {
      data?: { user_id: string; user_login: string; user_name: string; followed_at: string }[];
    };
    for (const f of json.data ?? []) {
      const at = f.followed_at;
      const ts = Date.parse(at);
      items.push({
        id: `follow-${f.user_id}-${at}`,
        kind: "follow",
        text: `${f.user_name || f.user_login} followed`,
        at: formatWhen(at),
        ts: Number.isNaN(ts) ? 0 : ts
      });
    }
  } else {
    const t = await followersRes.text();
    try {
      const j = JSON.parse(t) as { message?: string };
      if (j.message) errors.push(`Followers: ${j.message}`);
    } catch {
      if (followersRes.status === 403) errors.push("Followers: requires moderator access on this channel.");
    }
  }

  /** Helix subscriptions do not expose “subscribed at” timestamps; sorting them with artificial `Date.now()` hid follows. */
  const subItems: ActivityItem[] = [];
  const subsRes = await fetch(
    `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${encodeURIComponent(channelTwitchId)}&first=15`,
    { headers, cache: "no-store" }
  );
  if (subsRes.ok) {
    const json = (await subsRes.json()) as {
      data?: {
        user_id: string;
        user_login: string;
        user_name: string;
        tier?: string;
        is_gift?: boolean;
        gifter_name?: string;
        gifter_login?: string;
      }[];
    };
    let i = 0;
    for (const s of json.data ?? []) {
      const kind: ActivityItem["kind"] = s.is_gift ? "gift" : "sub";
      const tier = s.tier === "3000" ? "Tier 3" : s.tier === "2000" ? "Tier 2" : "Tier 1";
      const text = s.is_gift
        ? `${s.gifter_name || s.gifter_login || "Someone"} gifted ${s.user_name || s.user_login} a ${tier} sub`
        : `${s.user_name || s.user_login} subscribed (${tier})`;
      i += 1;
      subItems.push({
        id: `sub-${s.user_id}-${i}`,
        kind,
        text,
        at: "Active sub (Helix doesn’t expose subbed-at)",
        ts: 0
      });
    }
  } else {
    const t = await subsRes.text();
    try {
      const j = JSON.parse(t) as { message?: string };
      if (j.message) errors.push(`Subs: ${j.message}`);
    } catch {
      if (subsRes.status === 403) errors.push("Subs: only the broadcaster token can list subscribers.");
    }
  }

  /** Channel Points redemptions (REST snapshot; needs `channel:read:redemptions`). */
  const redeemItems: ActivityItem[] = [];
  const rewardsRes = await fetch(
    `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(channelTwitchId)}&first=15`,
    { headers, cache: "no-store" }
  );
  if (rewardsRes.ok) {
    const rewardsJson = (await rewardsRes.json()) as {
      data?: { id: string; title?: string }[];
    };
    const rewards = rewardsJson.data ?? [];
    const statuses = ["UNFULFILLED", "FULFILLED"] as const;

    await Promise.all(
      rewards.slice(0, 8).map(async (reward) => {
        for (const status of statuses) {
          const rRes = await fetch(
            `https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?broadcaster_id=${encodeURIComponent(
              channelTwitchId
            )}&reward_id=${encodeURIComponent(reward.id)}&status=${status}&first=5`,
            { headers, cache: "no-store" }
          );
          if (!rRes.ok) continue;
          const rJson = (await rRes.json()) as {
            data?: {
              id: string;
              user_name?: string;
              user_login?: string;
              redeemed_at?: string;
              reward?: { title?: string };
            }[];
          };
          for (const row of rJson.data ?? []) {
            const redeemedAt = row.redeemed_at;
            const ts = redeemedAt ? Date.parse(redeemedAt) : 0;
            const title = reward.title || row.reward?.title || "Channel Points";
            const who = row.user_name || row.user_login || "Someone";
            const st = status === "UNFULFILLED" ? "pending" : "fulfilled";
            redeemItems.push({
              id: `cp-${reward.id}-${row.id}`,
              kind: "points",
              text: `${who}: ${title} (${st})`,
              at: formatWhen(redeemedAt),
              ts: Number.isNaN(ts) ? 0 : ts
            });
          }
        }
      })
    );
  } else {
    const txt = await rewardsRes.text();
    try {
      const j = JSON.parse(txt) as { message?: string };
      if (j.message) errors.push(`Channel Points: ${j.message}`);
    } catch {
      if (rewardsRes.status === 403) errors.push("Channel Points: needs broadcaster token with channel:read:redemptions.");
    }
  }

  const seenCp = new Set<string>();
  const redeemDeduped = redeemItems.filter((row) => {
    if (seenCp.has(row.id)) return false;
    seenCp.add(row.id);
    return true;
  });
  redeemDeduped.sort((a, b) => b.ts - a.ts);

  /** Newest redeem + follower activity first (real timestamps); subs are a snapshot and appended below. */
  const followSorted = [...items].sort((a, b) => b.ts - a.ts);
  const timedCombined = [...redeemDeduped, ...followSorted].sort((a, b) => b.ts - a.ts);
  const merged = [...timedCombined.slice(0, 22), ...subItems.slice(0, 10)];

  return Response.json({
    channelTwitchId,
    items: merged.slice(0, 26),
    partial: errors.length > 0,
    warnings: errors
  });
}
