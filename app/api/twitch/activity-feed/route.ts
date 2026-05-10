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
      const ts = Date.now() - i * 1000;
      i += 1;
      items.push({
        id: `sub-${s.user_id}-${i}`,
        kind,
        text,
        at: "Recent",
        ts
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

  items.sort((a, b) => b.ts - a.ts);

  return Response.json({
    channelTwitchId,
    items: items.slice(0, 25),
    partial: errors.length > 0,
    warnings: errors
  });
}
