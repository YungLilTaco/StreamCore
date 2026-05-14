-- CreateTable
CREATE TABLE "BotCommand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelTwitchId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldownSec" INTEGER NOT NULL DEFAULT 5,
    "modOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelTwitchId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "prefix" TEXT NOT NULL DEFAULT '!',
    "greetingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "greetingMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotCommand_channelTwitchId_trigger_key" ON "BotCommand"("channelTwitchId", "trigger");

-- CreateIndex
CREATE INDEX "BotCommand_userId_idx" ON "BotCommand"("userId");

-- CreateIndex
CREATE INDEX "BotCommand_channelTwitchId_idx" ON "BotCommand"("channelTwitchId");

-- CreateIndex
CREATE UNIQUE INDEX "BotSettings_channelTwitchId_key" ON "BotSettings"("channelTwitchId");

-- CreateIndex
CREATE INDEX "BotSettings_userId_idx" ON "BotSettings"("userId");

-- AddForeignKey
ALTER TABLE "BotCommand" ADD CONSTRAINT "BotCommand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSettings" ADD CONSTRAINT "BotSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
