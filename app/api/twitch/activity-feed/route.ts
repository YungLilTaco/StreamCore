import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProviderAccessToken } from "@/lib/tokens";

const MAX_FEED_ITEMS = 80;
/** Helix allows up to `first=100` on these endpoints — we cap pages to limit latency/cost. */
const HELIX_FIRST = 100;
const HELIX_MAX_PAGES = 4;

/** Sort key for subscriptions: Helix has no subscribed-at → keep below all real timestamps. */
const SUB_SORT_BASE = Number.MIN_SAFE_INTEGER / 4;

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
  /** Epoch ms — used server-side only for sorting */
  ts: number;
};

function formatAt(iso: string | null | undefined): { label: string; ts: number } {
  if (!iso) return { label: "Time unknown", ts: 0 };
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { label: "Time unknown", ts: 0 };
  const label = new Date(t).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
  return { label, ts: t };
}

async function paginateFollowers(
  broadcasterId: string,
  headers: HeadersInit
): Promise<{ rows: ActivityItem[]; ok: boolean; errorNote?: string; status?: number }> {
  const rows: ActivityItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < HELIX_MAX_PAGES; page++) {
    const q = new URLSearchParams({
      broadcaster_id: broadcasterId,
      first: String(HELIX_FIRST)
    });
    if (cursor) q.set("after", cursor);
    const res = await fetch(`https://api.twitch.tv/helix/channels/followers?${q}`, {
      headers,
      cache: "no-store"
    });
    if (!res.ok) {
      let msg: string | undefined;
      try {
        msg = (JSON.parse(await res.text()) as { message?: string }).message;
      } catch {
        /* ignore */
      }
      return {
        rows,
        ok: false,
        errorNote:
          msg ||
          (res.status === 403
            ? "Followers: broadcaster/mod token with moderator:read:followers required."
            : `Followers request failed (${res.status})`),
        status: res.status
      };
    }
    const json = (await res.json()) as {
      data?: { user_id: string; user_login: string; user_name: string; followed_at: string }[];
      pagination?: { cursor?: string };
    };
    for (const f of json.data ?? []) {
      const { label, ts } = formatAt(f.followed_at);
      rows.push({
        id: `follow-${f.user_id}-${f.followed_at}`,
        kind: "follow",
        text: `${f.user_name || f.user_login} followed`,
        at: label,
        ts
      });
    }
    cursor = json.pagination?.cursor;
    if (!cursor || !(json.data?.length ?? 0)) break;
  }
  return { rows, ok: true };
}

async function paginateSubscriptions(
  broadcasterId: string,
  headers: HeadersInit,
  errors: string[]
): Promise<ActivityItem[]> {
  const subRows: ActivityItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < HELIX_MAX_PAGES; page++) {
    const q = new URLSearchParams({
      broadcaster_id: broadcasterId,
      first: String(HELIX_FIRST)
    });
    if (cursor) q.set("after", cursor);
    const res = await fetch(`https://api.twitch.tv/helix/subscriptions?${q}`, {
      headers,
      cache: "no-store"
    });
    if (!res.ok) {
      const raw = await res.text();
      try {
        const j = JSON.parse(raw) as { message?: string };
        if (j.message) errors.push(`Subs: ${j.message}`);
      } catch {
        if (res.status === 403) errors.push("Subs: broadcaster token required for subscriber list.");
      }
      break;
    }
    const json = (await res.json()) as {
      data?: {
        user_id: string;
        user_login: string;
        user_name: string;
        tier?: string;
        is_gift?: boolean;
        gifter_name?: string;
        gifter_login?: string;
      }[];
      pagination?: { cursor?: string };
    };
    let idx = subRows.length;
    for (const s of json.data ?? []) {
      const kind: ActivityItem["kind"] = s.is_gift ? "gift" : "sub";
      const tier = s.tier === "3000" ? "Tier 3" : s.tier === "2000" ? "Tier 2" : "Tier 1";
      const text = s.is_gift
        ? `${s.gifter_name || s.gifter_login || "Someone"} gifted ${s.user_name || s.user_login} a ${tier} sub`
        : `${s.user_name || s.user_login} subscribed (${tier})`;
      idx += 1;
      subRows.push({
        id: `sub-${s.user_id}-${page}-${idx}`,
        kind,
        text,
        at: "Active subscription (Helix does not expose when it started)",
        ts: SUB_SORT_BASE + idx
      });
    }
    cursor = json.pagination?.cursor;
    if (!cursor || !(json.data?.length ?? 0)) break;
  }
  return subRows;
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

  const errors: string[] = [];

  const { rows: followRows, ok: followsOk, errorNote: followersErr } =
    await paginateFollowers(channelTwitchId, headers);
  if (!followsOk && followersErr) errors.push(followersErr);

  const subItems = await paginateSubscriptions(channelTwitchId, headers, errors);

  const redeemItems: ActivityItem[] = [];
  const rewardsRes = await fetch(
    `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(channelTwitchId)}&first=20`,
    { headers, cache: "no-store" }
  );
  if (rewardsRes.ok) {
    const rewardsJson = (await rewardsRes.json()) as {
      data?: { id: string; title?: string }[];
    };
    const rewards = rewardsJson.data ?? [];
    const statuses = ["UNFULFILLED", "FULFILLED", "CANCELED"] as const;

    await Promise.all(
      rewards.map(async (reward) => {
        for (const status of statuses) {
          const rq = new URLSearchParams({
            broadcaster_id: channelTwitchId,
            reward_id: reward.id,
            status,
            first: "25"
          });
          const rRes = await fetch(
            `https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?${rq}`,
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
            let { label, ts } = formatAt(redeemedAt);
            if (ts === 0 && redeemedAt) {
              const t2 = Date.parse(redeemedAt);
              if (!Number.isNaN(t2)) ts = t2;
            }
            const title = reward.title || row.reward?.title || "Channel Points";
            const who = row.user_name || row.user_login || "Someone";
            const st = status.toLowerCase();
            redeemItems.push({
              id: `cp-${reward.id}-${row.id}`,
              kind: "points",
              text: `${who}: ${title} (${st})`,
              at: ts ? label : "Time unknown",
              ts
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
      if (rewardsRes.status === 403) errors.push("Channel Points: broadcaster + channel:read:redemptions.");
    }
  }

  const seenCp = new Set<string>();
  const redeemDeduped = redeemItems.filter((row) => {
    if (seenCp.has(row.id)) return false;
    seenCp.add(row.id);
    return true;
  });

  /**
   * Newest real timestamps first. Rows with ts=0 (unknown time) sit above subscription snapshot rows.
   * Subscriptions use synthetic low ts — Twitch Helix subscriber list does not include subscribed-at.
   */
  const withSubs = [...followRows, ...redeemDeduped, ...subItems].sort((a, b) => {
    const d = b.ts - a.ts;
    if (d !== 0) return d;
    return String(a.id).localeCompare(String(b.id));
  });

  const pubItems = withSubs.slice(0, MAX_FEED_ITEMS).map(({ id, kind, text, at }) => ({ id, kind, text, at }));

  return Response.json({
    channelTwitchId,
    items: pubItems,
    partial: errors.length > 0,
    warnings: errors,
    /** Bits, incoming raids, and third-party donations are not available on these Helix calls — EventSub/other APIs. */
    notInFeed: ["bits_in_chat", "incoming_raids", "third_party_donations"]
  });
}
