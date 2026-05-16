import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProviderAccessToken } from "@/lib/tokens";
import { deleteRedemptionByTwitchId } from "@/lib/channel-redemptions";

function twitchHeaders(accessToken: string): Record<string, string> {
  const clientId = process.env.TWITCH_CLIENT_ID ?? "";
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
  if (clientId) h["Client-Id"] = clientId;
  return h;
}

async function assertSelfChannel(userId: string, channelTwitchId: string) {
  const twitchAccount = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true, scope: true }
  });
  if (!twitchAccount?.providerAccountId || twitchAccount.providerAccountId !== channelTwitchId) {
    return null;
  }
  const scope = twitchAccount.scope ?? "";
  const scopes = scope.split(/\s+/);
  return { hasManage: scopes.includes("channel:manage:redemptions") };
}

type PatchBody = {
  channelTwitchId?: string;
  rewardId?: string;
  redemptionId?: string;
  status?: "FULFILLED" | "CANCELED";
} | null;

/**
 * PATCH /api/twitch/reward-redemption
 *
 * Body: `{ channelTwitchId, rewardId, redemptionId, status: "FULFILLED" | "CANCELED" }`
 * Requires `channel:manage:redemptions` on the broadcaster Twitch token.
 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PatchBody;
  const channelTwitchId = typeof body?.channelTwitchId === "string" ? body.channelTwitchId.trim() : "";
  const rewardId = typeof body?.rewardId === "string" ? body.rewardId.trim() : "";
  const redemptionId = typeof body?.redemptionId === "string" ? body.redemptionId.trim() : "";
  const status = body?.status;

  if (!channelTwitchId || !rewardId || !redemptionId) {
    return Response.json({ message: "channelTwitchId, rewardId, and redemptionId are required." }, { status: 400 });
  }
  if (status !== "FULFILLED" && status !== "CANCELED") {
    return Response.json({ message: "status must be FULFILLED or CANCELED." }, { status: 400 });
  }

  const access = await assertSelfChannel(session.user.id, channelTwitchId);
  if (!access) {
    return Response.json({ message: "Reward actions are only available on your own channel." }, { status: 403 });
  }
  if (!access.hasManage) {
    return Response.json(
      {
        message:
          "Missing channel:manage:redemptions on your Twitch connection — sign out and sign in with Twitch again."
      },
      { status: 403 }
    );
  }

  if (!process.env.TWITCH_CLIENT_ID) {
    return Response.json({ message: "Server missing TWITCH_CLIENT_ID" }, { status: 500 });
  }

  const { accessToken } = await getProviderAccessToken(session.user.id, "twitch");
  const qs = new URLSearchParams({
    id: redemptionId,
    broadcaster_id: channelTwitchId,
    reward_id: rewardId
  });
  const res = await fetch(`https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?${qs}`, {
    method: "PATCH",
    headers: twitchHeaders(accessToken),
    body: JSON.stringify({ status }),
    cache: "no-store"
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return Response.json({ message: t || `Twitch ${res.status}` }, { status: res.status });
  }
  await deleteRedemptionByTwitchId(redemptionId, channelTwitchId).catch(() => {});
  return Response.json({ ok: true });
}
