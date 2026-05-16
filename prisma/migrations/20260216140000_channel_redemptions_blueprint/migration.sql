-- Blueprint realignment: surrogate PK + snake_case columns + twitch redemption id for Helix.
DROP TABLE IF EXISTS "channel_redemptions";

CREATE TABLE "channel_redemptions" (
    "id" TEXT NOT NULL,
    "twitchRedemptionId" TEXT NOT NULL,
    "channelTwitchId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_login" TEXT,
    "reward_title" TEXT NOT NULL,
    "user_input" TEXT,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNFULFILLED',
    "redeemed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_redemptions_twitchRedemptionId_key" ON "channel_redemptions"("twitchRedemptionId");
CREATE INDEX "channel_redemptions_channelTwitchId_status_idx" ON "channel_redemptions"("channelTwitchId", "status");
