-- CreateTable
CREATE TABLE "channel_redemptions" (
    "id" TEXT NOT NULL,
    "channelTwitchId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "rewardTitle" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userLogin" TEXT,
    "userInput" TEXT,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNFULFILLED',
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_redemptions_channelTwitchId_status_idx" ON "channel_redemptions"("channelTwitchId", "status");
