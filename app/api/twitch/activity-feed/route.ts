import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  coerceActivityFeedWindowDays,
  type ActivityFeedEventKind,
  type ActivityFeedItemDTO
} from "@/lib/twitch-activity-feed-model";
import { forceRefreshProviderToken, getProviderAccessToken } from "@/lib/tokens";

const MAX_FEED_ITEMS = 150;
const HELIX_FIRST = 100;
const HELIX_MAX_PAGES = 4;

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

type Row = ActivityFeedItemDTO;

function parseTs(iso: string | null | undefined): { label: string; ts: number } {
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
): Promise<{ rows: Row[]; ok: boolean; errorNote?: string }> {
  const rows: Row[] = [];
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
            : `Followers request failed (${res.status})`)
      };
    }
    const json = (await res.json()) as {
      data?: { user_id: string; user_login: string; user_name: string; followed_at: string }[];
      pagination?: { cursor?: string };
    };
    for (const f of json.data ?? []) {
      const { ts } = parseTs(f.followed_at);
      rows.push({
        id: `follow-${f.user_id}-${f.followed_at}`,
        kind: "follow",
        text: `${f.user_name || f.user_login} followed`,
        ts,
        actorTwitchId: f.user_id,
        actorLogin: f.user_login,
        actorDisplayName: f.user_name
      });
    }
    cursor = json.pagination?.cursor;
    if (!cursor || !(json.data?.length ?? 0)) break;
  }
  return { rows, ok: true };
}

type EndpointResult<T> = { rows: T[]; status: number; message: string | null };

async function readHelixMessage(res: Response): Promise<string | null> {
  try {
    const j = (await res.clone().json()) as { message?: string };
    return j.message ?? null;
  } catch {
    return null;
  }
}

async function fetchPollRows(broadcasterId: string, headers: HeadersInit): Promise<EndpointResult<Row>> {
  const q = new URLSearchParams({ broadcaster_id: broadcasterId, first: "15" });
  const res = await fetch(`https://api.twitch.tv/helix/polls?${q}`, { headers, cache: "no-store" });
  if (!res.ok) {
    return { rows: [], status: res.status, message: await readHelixMessage(res) };
  }
  const json = (await res.json()) as {
    data?: { id: string; title: string; status?: string; started_at?: string }[];
  };
  const rows: Row[] = [];
  for (const p of json.data ?? []) {
    const { ts } = parseTs(p.started_at);
    rows.push({
      id: `poll-${p.id}`,
      kind: "poll",
      text: `Poll: ${p.title}${p.status ? ` (${p.status})` : ""}`,
      ts: ts || 0
    });
  }
  return { rows, status: res.status, message: null };
}

async function fetchPredictionRows(broadcasterId: string, headers: HeadersInit): Promise<EndpointResult<Row>> {
  const q = new URLSearchParams({ broadcaster_id: broadcasterId, first: "15" });
  const res = await fetch(`https://api.twitch.tv/helix/predictions?${q}`, { headers, cache: "no-store" });
  if (!res.ok) {
    return { rows: [], status: res.status, message: await readHelixMessage(res) };
  }
  const json = (await res.json()) as {
    data?: { id: string; title: string; status?: string; created_at?: string }[];
  };
  const rows: Row[] = [];
  for (const p of json.data ?? []) {
    const { ts } = parseTs(p.created_at);
    rows.push({
      id: `prediction-${p.id}`,
      kind: "prediction",
      text: `Prediction: ${p.title}${p.status ? ` (${p.status})` : ""}`,
      ts: ts || 0
    });
  }
  return { rows, status: res.status, message: null };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  if (!channelTwitchId) return new Response("Missing channelTwitchId", { status: 400 });

  const windowDays = coerceActivityFeedWindowDays(url.searchParams.get("windowDays"));

  const access = await assertCanAccessChannel(session.user.id, channelTwitchId);
  if (!access) return new Response("Forbidden", { status: 403 });

  let accessToken: string;
  try {
    accessToken = (await getProviderAccessToken(session.user.id, "twitch")).accessToken;
  } catch {
    return Response.json({
      channelTwitchId,
      items: [],
      partial: true,
      warnings: ["Your Twitch token is unavailable. Sign out and sign in again on this app."],
      hydratedKinds: [],
      notInHelixSnapshot: []
    });
  }

  const errors: string[] = [];

  async function validate(token: string): Promise<string[] | null> {
    try {
      const r = await fetch("https://id.twitch.tv/oauth2/validate", {
        headers: { Authorization: `OAuth ${token}` },
        cache: "no-store"
      });
      if (!r.ok) return null;
      const v = (await r.json()) as { scopes?: string[] };
      return (v.scopes ?? []).filter(Boolean);
    } catch {
      return null;
    }
  }

  /**
   * If the token is invalid (e.g. user disconnected on twitch.tv then PrismaAdapter kept the
   * revoked token), try one refresh-token rotation. If THAT also fails, surface a clear "re-login"
   * message — the refresh token was revoked too, so the only recovery is a fresh OAuth flow.
   */
  let scopeArr = await validate(accessToken);
  if (scopeArr === null) {
    try {
      const refreshed = await forceRefreshProviderToken(session.user.id, "twitch");
      accessToken = refreshed.accessToken;
      scopeArr = await validate(accessToken);
    } catch {
      scopeArr = null;
    }
  }

  if (scopeArr === null) {
    return Response.json({
      channelTwitchId,
      items: [],
      partial: true,
      warnings: [
        "Twitch rejected this token (it was revoked when you disconnected the app on twitch.tv). Sign out of StreamCore and sign in again — once you do, future re-auths will keep the new tokens automatically."
      ],
      hydratedKinds: [],
      notInHelixSnapshot: []
    });
  }

  let scopeSet = new Set(scopeArr);
  if (scopeSet.size === 0) {
    const twitchAccountRow = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "twitch" },
      select: { scope: true }
    });
    scopeSet = new Set((twitchAccountRow?.scope ?? "").split(/\s+/).filter(Boolean));
  }
  const hasScope = (s: string) => scopeSet.has(s);

  const twitchAccountRow = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "twitch" },
    select: { providerAccountId: true }
  });
  const yourTwitchId = twitchAccountRow?.providerAccountId ?? null;

  const headers = twitchHeaders(accessToken);

  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  if (access.isSelf) {
    if (!hasScope("channel:read:subscriptions")) missingRequired.push("channel:read:subscriptions");
    if (!hasScope("channel:read:redemptions")) missingRequired.push("channel:read:redemptions");
    if (!hasScope("channel:read:polls")) missingOptional.push("channel:read:polls");
    if (!hasScope("channel:read:predictions")) missingOptional.push("channel:read:predictions");
  }

  if (!access.isSelf) {
    errors.push(
      `Selected channel (${channelTwitchId}) is not your own Twitch account${
        yourTwitchId ? ` (yours is ${yourTwitchId})` : ""
      }. Helix only returns subs / channel points / polls / predictions for your own channel — switch the channel in the header to see those.`
    );
  } else if (missingRequired.length || missingOptional.length) {
    const lines: string[] = [];
    if (missingRequired.length) {
      lines.push(`Missing required scopes: ${missingRequired.join(", ")}.`);
    }
    if (missingOptional.length) {
      lines.push(`Missing optional scopes: ${missingOptional.join(", ")}.`);
    }
    lines.push(
      "Twitch sometimes re-grants only the previously authorized scopes silently. To pick up new scopes: open https://www.twitch.tv/settings/connections, click Disconnect on this app, sign out of StreamCore, sign in again, and APPROVE the Twitch consent screen."
    );
    errors.push(lines.join(" "));
  }

  const { rows: followRows, ok: followsOk, errorNote: followersErr } =
    await paginateFollowers(channelTwitchId, headers);
  if (!followsOk && followersErr) errors.push(followersErr);

  let pollRows: Row[] = [];
  let predictionRows: Row[] = [];
  const redeemItems: Row[] = [];

  let pollsStatus = 0;
  let pollsMessage: string | null = null;
  let predictionsStatus = 0;
  let predictionsMessage: string | null = null;
  let rewardsStatus = 0;
  let rewardsMessage: string | null = null;

  /**
   * Subscriptions are intentionally NOT fetched from Helix here: that endpoint returns a roster
   * with no `subscribed_at`, which we'd be forced to show as ts=0 (no timestamp). New subs now
   * arrive via EventSub WebSocket (`channel.subscribe` / `channel.subscription.gift`) with real
   * timestamps and naturally sort to the top of the feed.
   */

  if (access.isSelf) {
    if (hasScope("channel:read:polls")) {
      const r = await fetchPollRows(channelTwitchId, headers);
      pollRows = r.rows;
      pollsStatus = r.status;
      pollsMessage = r.message;
    }
    if (hasScope("channel:read:predictions")) {
      const r = await fetchPredictionRows(channelTwitchId, headers);
      predictionRows = r.rows;
      predictionsStatus = r.status;
      predictionsMessage = r.message;
    }
  }

  if (access.isSelf && hasScope("channel:read:redemptions")) {
    const rewardsRes = await fetch(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(channelTwitchId)}&first=20`,
      { headers, cache: "no-store" }
    );
    rewardsStatus = rewardsRes.status;
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
                user_id?: string;
                user_name?: string;
                user_login?: string;
                redeemed_at?: string;
                reward?: { title?: string };
              }[];
            };
            for (const row of rJson.data ?? []) {
              const redeemedAt = row.redeemed_at;
              let { ts } = parseTs(redeemedAt);
              if (ts === 0 && redeemedAt) {
                const t2 = Date.parse(redeemedAt);
                if (!Number.isNaN(t2)) ts = t2;
              }
              const title = reward.title || row.reward?.title || "Channel Points";
              const who = row.user_name || row.user_login || "Someone";
              const st = status.toLowerCase();
              redeemItems.push({
                id: `cp-${reward.id}-${row.id}`,
                kind: "channel_points_redeem",
                text: `${who}: ${title} (${st})`,
                ts,
                actorTwitchId: row.user_id,
                actorLogin: row.user_login,
                actorDisplayName: row.user_name
              });
            }
          }
        })
      );
    } else {
      rewardsMessage = await readHelixMessage(rewardsRes);
    }
  }

  const seenCp = new Set<string>();
  const redeemDeduped = redeemItems.filter((row) => {
    if (seenCp.has(row.id)) return false;
    seenCp.add(row.id);
    return true;
  });

  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const allRows = [...followRows, ...redeemDeduped, ...pollRows, ...predictionRows];
  /** Every Helix row in this feed has a real timestamp — drop anything older than the window. */
  const recentRows = allRows.filter((row) => row.ts >= cutoffMs);

  const merged = recentRows.sort((a, b) => {
    const d = b.ts - a.ts;
    if (d !== 0) return d;
    return String(a.id).localeCompare(String(b.id));
  });

  const items = merged.slice(0, MAX_FEED_ITEMS);

  const hydratedKinds = new Set<ActivityFeedEventKind>();
  for (const it of items) hydratedKinds.add(it.kind);

  /** Only surface per-endpoint warnings for genuine HTTP failures. status=0 = skipped (no scope / !isSelf); 2xx = success. */
  const reportEndpointFailure = (label: string, status: number, message: string | null) => {
    if (status === 0 || (status >= 200 && status < 300)) return;
    errors.push(`${label} request failed (HTTP ${status})${message ? ` — ${message}` : ""}.`);
  };
  reportEndpointFailure("Channel point rewards", rewardsStatus, rewardsMessage);
  reportEndpointFailure("Polls", pollsStatus, pollsMessage);
  reportEndpointFailure("Predictions", predictionsStatus, predictionsMessage);

  return Response.json({
    channelTwitchId,
    windowDays,
    items,
    partial: errors.length > 0,
    warnings: errors,
    /** Kinds that appeared in this response (Helix-backed subset). */
    hydratedKinds: [...hydratedKinds],
    /** EventSub / extra scopes typically required for live rows of these kinds. */
    notInHelixSnapshot: [
      "cheer",
      "boost",
      "collaboration_request",
      "goal",
      "hype_train",
      "raid",
      "shoutout",
      "watch_streak"
    ]
  });
}
