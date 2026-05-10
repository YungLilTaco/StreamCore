-- CreateEnum
CREATE TYPE "PermissionRole" AS ENUM ('BASIC_EDITOR', 'EDITOR', 'FULL_CONTROL');

-- CreateTable
CREATE TABLE "ChannelPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelTwitchId" TEXT NOT NULL,
    "channelDisplayName" TEXT NOT NULL,
    "role" "PermissionRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "channelTwitchId" TEXT NOT NULL,
    "channelDisplayName" TEXT NOT NULL,
    "role" "PermissionRole" NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "usedByUserId" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelPermission_channelTwitchId_idx" ON "ChannelPermission"("channelTwitchId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPermission_userId_channelTwitchId_key" ON "ChannelPermission"("userId", "channelTwitchId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionInvite_token_key" ON "PermissionInvite"("token");

-- CreateIndex
CREATE INDEX "PermissionInvite_channelTwitchId_idx" ON "PermissionInvite"("channelTwitchId");

-- CreateIndex
CREATE INDEX "PermissionInvite_token_idx" ON "PermissionInvite"("token");

-- AddForeignKey
ALTER TABLE "ChannelPermission" ADD CONSTRAINT "ChannelPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionInvite" ADD CONSTRAINT "PermissionInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
