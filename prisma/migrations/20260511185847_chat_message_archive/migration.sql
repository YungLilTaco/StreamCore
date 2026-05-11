-- CreateTable
CREATE TABLE "ChatMessageArchive" (
    "id" TEXT NOT NULL,
    "channelTwitchId" TEXT NOT NULL,
    "ircId" TEXT NOT NULL,
    "userTwitchId" TEXT,
    "userLogin" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "color" TEXT,
    "text" TEXT NOT NULL,
    "badges" TEXT,
    "ts" BIGINT NOT NULL,
    "isMod" BOOLEAN NOT NULL DEFAULT false,
    "isSubscriber" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessageArchive_channelTwitchId_userTwitchId_ts_idx" ON "ChatMessageArchive"("channelTwitchId", "userTwitchId", "ts");

-- CreateIndex
CREATE INDEX "ChatMessageArchive_channelTwitchId_userLogin_ts_idx" ON "ChatMessageArchive"("channelTwitchId", "userLogin", "ts");

-- CreateIndex
CREATE INDEX "ChatMessageArchive_channelTwitchId_ts_idx" ON "ChatMessageArchive"("channelTwitchId", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageArchive_channelTwitchId_ircId_key" ON "ChatMessageArchive"("channelTwitchId", "ircId");
