import { prisma } from "@/lib/prisma";

export type EventSubRedemptionEvent = {
  id?: string;
  broadcaster_user_id?: string;
  user_login?: string;
  user_name?: string;
  user_input?: string;
  redeemed_at?: string;
  status?: string;
  reward?: { id?: string; title?: string; cost?: number };
};

function parseRedeemedAt(iso?: string): Date | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * Upsert from EventSub `channel.channel_points_custom_reward_redemption.add` (unfulfilled only).
 */
export async function upsertPendingRedemptionFromEventSub(event: EventSubRedemptionEvent): Promise<void> {
  const twitchRedemptionId = typeof event.id === "string" ? event.id.trim() : "";
  const channelTwitchId =
    typeof event.broadcaster_user_id === "string" ? event.broadcaster_user_id.trim() : "";
  if (!twitchRedemptionId || !channelTwitchId) return;

  const statusRaw = (event.status ?? "unfulfilled").toString().toLowerCase();
  if (statusRaw !== "unfulfilled") return;

  const reward = event.reward ?? {};
  const rewardId = typeof reward.id === "string" ? reward.id.trim() : "";
  if (!rewardId) return;

  const rewardTitle =
    typeof reward.title === "string" && reward.title.trim() ? reward.title.trim() : "Reward";
  const cost =
    typeof reward.cost === "number" && Number.isFinite(reward.cost) ? Math.max(0, Math.floor(reward.cost)) : 0;
  const userName =
    (typeof event.user_name === "string" && event.user_name.trim()) ||
    (typeof event.user_login === "string" && event.user_login.trim()) ||
    "Anonymous";
  const userLogin =
    typeof event.user_login === "string" && event.user_login.trim()
      ? event.user_login.trim().toLowerCase()
      : null;
  const userInput =
    typeof event.user_input === "string" && event.user_input.trim() ? event.user_input.trim() : null;
  const redeemedAt = parseRedeemedAt(event.redeemed_at);

  await prisma.channelRedemption.upsert({
    where: { twitchRedemptionId },
    create: {
      twitchRedemptionId,
      channelTwitchId,
      rewardId,
      rewardTitle,
      userName,
      userLogin,
      userInput,
      cost,
      status: "UNFULFILLED",
      redeemedAt
    },
    update: {
      channelTwitchId,
      rewardId,
      rewardTitle,
      userName,
      userLogin,
      userInput,
      cost,
      redeemedAt: redeemedAt ?? undefined,
      status: "UNFULFILLED"
    }
  });
}

export async function deleteRedemptionByTwitchId(
  twitchRedemptionId: string,
  channelTwitchId: string
): Promise<void> {
  await prisma.channelRedemption.deleteMany({
    where: { twitchRedemptionId, channelTwitchId }
  });
}

export async function setRedemptionStatusByTwitchId(
  twitchRedemptionId: string,
  channelTwitchId: string,
  status: "FULFILLED" | "CANCELED"
): Promise<void> {
  await prisma.channelRedemption.updateMany({
    where: { twitchRedemptionId, channelTwitchId },
    data: { status }
  });
}
