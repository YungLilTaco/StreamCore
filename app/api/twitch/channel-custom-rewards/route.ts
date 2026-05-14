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

async function assertOwnChannel(userId: string, channelTwitchId: string): Promise<boolean> {
  const tw = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true }
  });
  return Boolean(tw?.providerAccountId && tw.providerAccountId === channelTwitchId);
}

/**
 * Lists custom channel point rewards for the signed-in broadcaster’s channel.
 * Used by the Song Requests page to pick the !sr redemption trigger without pasting a raw UUID.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  if (!channelTwitchId) return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });

  const ok = await assertOwnChannel(session.user.id, channelTwitchId);
  if (!ok) {
    return Response.json({ message: "Rewards are only listable on your own channel." }, { status: 403 });
  }

  const { accessToken } = await getProviderAccessToken(session.user.id, "twitch");

  const res = await fetch(
    `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(channelTwitchId)}&first=50`,
    { headers: twitchHeaders(accessToken), cache: "no-store" }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || `Twitch ${res.status}`;
    try {
      const j = JSON.parse(text) as { message?: string };
      if (j.message) message = j.message;
    } catch {
      /* ignore */
    }
    return Response.json(
      {
        message,
        rewards: [] as { id: string; title: string; cost: number }[]
      },
      { status: res.status }
    );
  }

  const json = (await res.json()) as {
    data?: { id: string; title: string; cost: number }[];
  };
  const rewards = (json.data ?? []).map((r) => ({
    id: r.id,
    title: r.title ?? "Reward",
    cost: typeof r.cost === "number" ? r.cost : 0
  }));

  return Response.json({ rewards });
}
