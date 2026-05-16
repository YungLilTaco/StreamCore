import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { upsertPendingRedemptionFromEventSub, type EventSubRedemptionEvent } from "@/lib/channel-redemptions";

export const dynamic = "force-dynamic";

async function assertOwnBroadcaster(userId: string, channelTwitchId: string): Promise<boolean> {
  const acc = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true }
  });
  return Boolean(acc?.providerAccountId && acc.providerAccountId === channelTwitchId);
}

/**
 * Authenticated ingest: browser EventSub WebSocket forwards `channel.channel_points_custom_reward_redemption.add`
 * payloads so redemptions are stored without a public HTTP webhook (localhost-safe).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    channelTwitchId?: string;
    event?: EventSubRedemptionEvent;
  } | null;

  const channelTwitchId = typeof body?.channelTwitchId === "string" ? body.channelTwitchId.trim() : "";
  const event = body?.event;
  if (!channelTwitchId || !event) {
    return Response.json({ message: "channelTwitchId and event are required." }, { status: 400 });
  }

  const ok = await assertOwnBroadcaster(session.user.id, channelTwitchId);
  if (!ok) {
    return Response.json({ message: "You can only ingest redemptions for your own Twitch channel." }, { status: 403 });
  }

  if (event.broadcaster_user_id && event.broadcaster_user_id !== channelTwitchId) {
    return Response.json({ message: "Event broadcaster does not match channelTwitchId." }, { status: 400 });
  }

  await upsertPendingRedemptionFromEventSub({ ...event, broadcaster_user_id: channelTwitchId });
  return Response.json({ ok: true });
}
