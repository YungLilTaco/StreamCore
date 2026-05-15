import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProviderAccessToken } from "@/lib/tokens";
import { resolveSpotifyTrackFromQuery } from "@/lib/spotify-track-search";

async function assertOwnChannel(userId: string, channelTwitchId: string): Promise<boolean> {
  const tw = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true }
  });
  return Boolean(tw?.providerAccountId && tw.providerAccountId === channelTwitchId);
}

type SongCfg = {
  allowEveryone: boolean;
  subsOnly: boolean;
  vipsOnly: boolean;
  modsOnly: boolean;
  channelPointsRewardId: string | null;
};

function passesRequestGate(
  cfg: SongCfg,
  flags: { isSubscriber: boolean; isVip: boolean; isMod: boolean }
): boolean {
  if (cfg.allowEveryone) return true;
  return (
    (!cfg.subsOnly || flags.isSubscriber) &&
    (!cfg.vipsOnly || flags.isVip) &&
    (!cfg.modsOnly || flags.isMod)
  );
}

async function spotifyAddToQueue(
  accessToken: string,
  uri: string
): Promise<{ ok: boolean; status: number; message?: string }> {
  const res = await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (res.ok || res.status === 204) return { ok: true, status: res.status };
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, message: text || undefined };
}

async function twitchFulfillRedemption(
  userId: string,
  channelTwitchId: string,
  rewardId: string,
  redemptionId: string
): Promise<{ ok: boolean; skipped?: string; message?: string }> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { scope: true }
  });
  const scopes = (account?.scope ?? "").split(/\s+/);
  if (!scopes.includes("channel:manage:redemptions")) {
    return { ok: false, skipped: "missing_channel_manage_redemptions" };
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) return { ok: false, message: "Missing TWITCH_CLIENT_ID" };

  const { accessToken } = await getProviderAccessToken(userId, "twitch");
  const qs = new URLSearchParams({
    id: redemptionId,
    broadcaster_id: channelTwitchId,
    reward_id: rewardId
  });
  const res = await fetch(`https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?${qs}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status: "FULFILLED" }),
    cache: "no-store"
  });
  if (res.ok) return { ok: true };
  const t = await res.text().catch(() => "");
  return { ok: false, message: t || `Twitch ${res.status}` };
}

type PostBody = {
  channelTwitchId?: string;
  requestedByLogin?: string;
  query?: string;
  isSubscriber?: boolean;
  isVip?: boolean;
  isMod?: boolean;
  redemption?: { rewardId: string; redemptionId: string } | null;
} | null;

/**
 * Chat / EventSub automation: resolve a Spotify track, append `SongRequestQueueItem`, enqueue on
 * Spotify playback, optionally mark the Channel Points redemption FULFILLED.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PostBody;
  const channelTwitchId = typeof body?.channelTwitchId === "string" ? body.channelTwitchId.trim() : "";
  if (!channelTwitchId) return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });

  if (!(await assertOwnChannel(session.user.id, channelTwitchId))) {
    return Response.json({ message: "Song requests can only be automated on your own channel." }, { status: 403 });
  }

  const requestedByLogin =
    typeof body?.requestedByLogin === "string" && body.requestedByLogin.trim()
      ? body.requestedByLogin.trim().toLowerCase()
      : "unknown";
  const query = typeof body?.query === "string" ? body.query : "";
  const redemption =
    body?.redemption &&
    typeof body.redemption.rewardId === "string" &&
    typeof body.redemption.redemptionId === "string"
      ? { rewardId: body.redemption.rewardId.trim(), redemptionId: body.redemption.redemptionId.trim() }
      : null;

  const cfgRow = await prisma.songRequestConfig.findUnique({
    where: { channelTwitchId },
    select: {
      allowEveryone: true,
      subsOnly: true,
      vipsOnly: true,
      modsOnly: true,
      channelPointsRewardId: true
    }
  });
  const cfg: SongCfg = cfgRow ?? {
    allowEveryone: true,
    subsOnly: false,
    vipsOnly: false,
    modsOnly: false,
    channelPointsRewardId: null
  };

  const fromRedemption =
    Boolean(redemption && cfg.channelPointsRewardId && redemption.rewardId === cfg.channelPointsRewardId);

  if (redemption && cfg.channelPointsRewardId && !fromRedemption) {
    return Response.json({ message: "Ignored: redemption does not match configured song-request reward." }, { status: 400 });
  }

  if (!fromRedemption) {
    const flags = {
      isSubscriber: body?.isSubscriber === true,
      isVip: body?.isVip === true,
      isMod: body?.isMod === true
    };
    if (!passesRequestGate(cfg, flags)) {
      return Response.json({ message: "Song request not allowed for this viewer (channel rules)." }, { status: 403 });
    }
  }

  if (!query.trim()) {
    return Response.json({ message: "Missing query (Spotify link or search text)." }, { status: 400 });
  }

  let spotifyToken: string;
  try {
    const tok = await getProviderAccessToken(session.user.id, "spotify");
    spotifyToken = tok.accessToken;
  } catch {
    return Response.json({ message: "Spotify not connected. Link Spotify in Settings." }, { status: 400 });
  }

  const resolved = await resolveSpotifyTrackFromQuery(spotifyToken, query);
  if (!resolved) {
    return Response.json({ message: "Could not find that track on Spotify." }, { status: 400 });
  }

  const row = await prisma.songRequestQueueItem.create({
    data: {
      channelTwitchId,
      title: resolved.title,
      artist: resolved.artist,
      spotifyUri: resolved.uri,
      requestedByLogin
    },
    select: { id: true, title: true, artist: true, spotifyUri: true, requestedByLogin: true, createdAt: true }
  });

  const sq = await spotifyAddToQueue(spotifyToken, resolved.uri);

  let fulfill: { ok: boolean; skipped?: string; message?: string } | null = null;
  if (fromRedemption && redemption) {
    fulfill = await twitchFulfillRedemption(session.user.id, channelTwitchId, redemption.rewardId, redemption.redemptionId);
  }

  return Response.json({
    item: row,
    spotifyQueued: sq.ok,
    spotifyError: sq.ok ? undefined : sq.message ?? `HTTP ${sq.status}`,
    redemptionFulfill: fulfill
  });
}
