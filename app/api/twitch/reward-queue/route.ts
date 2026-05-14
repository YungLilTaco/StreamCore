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

async function assertSelfChannel(userId: string, channelTwitchId: string) {
  const twitchAccount = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true, scope: true }
  });
  if (!twitchAccount?.providerAccountId || twitchAccount.providerAccountId !== channelTwitchId) {
    return null;
  }
  const scope = twitchAccount.scope ?? "";
  return { hasRedemptions: scope.split(/\s+/).includes("channel:read:redemptions") };
}

export type RewardQueueItemDTO = {
  id: string;
  rewardId: string;
  rewardTitle: string;
  userLogin?: string;
  userName?: string;
  redeemedAt: string;
  status: string;
};

/**
 * UNFULFILLED channel point redemptions for the signed-in broadcaster (Helix).
 * Twitch does not expose a reliable public iframe for the rewards queue; this powers the in-app panel.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  if (!channelTwitchId) {
    return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });
  }

  const access = await assertSelfChannel(session.user.id, channelTwitchId);
  if (!access) {
    return Response.json({ message: "Reward queue is only available on your own channel." }, { status: 403 });
  }
  if (!access.hasRedemptions) {
    return Response.json({
      items: [] as RewardQueueItemDTO[],
      message: "Missing channel:read:redemptions scope — sign out and sign in with Twitch again."
    });
  }

  const { accessToken } = await getProviderAccessToken(session.user.id, "twitch");
  const headers = twitchHeaders(accessToken);

  const rewardsRes = await fetch(
    `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(channelTwitchId)}&first=50`,
    { headers, cache: "no-store" }
  );
  if (!rewardsRes.ok) {
    const t = await rewardsRes.text();
    return Response.json({ message: t || "Failed to load rewards" }, { status: rewardsRes.status });
  }

  const rewardsJson = (await rewardsRes.json()) as { data?: { id: string; title?: string }[] };
  const rewards = rewardsJson.data ?? [];

  const items: RewardQueueItemDTO[] = [];

  await Promise.all(
    rewards.map(async (reward) => {
      const rq = new URLSearchParams({
        broadcaster_id: channelTwitchId,
        reward_id: reward.id,
        status: "UNFULFILLED",
        first: "50"
      });
      const rRes = await fetch(
        `https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?${rq}`,
        { headers, cache: "no-store" }
      );
      if (!rRes.ok) return;
      const rJson = (await rRes.json()) as {
        data?: {
          id: string;
          user_login?: string;
          user_name?: string;
          redeemed_at?: string;
          reward?: { id?: string; title?: string };
        }[];
      };
      for (const row of rJson.data ?? []) {
        items.push({
          id: row.id,
          rewardId: reward.id,
          rewardTitle: reward.title || row.reward?.title || "Reward",
          userLogin: row.user_login,
          userName: row.user_name,
          redeemedAt: row.redeemed_at ?? "",
          status: "UNFULFILLED"
        });
      }
    })
  );

  items.sort((a, b) => Date.parse(b.redeemedAt) - Date.parse(a.redeemedAt));

  return Response.json({ items });
}
