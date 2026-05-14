-- CreateTable
CREATE TABLE "SongRequestConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelTwitchId" TEXT NOT NULL,
    "allowEveryone" BOOLEAN NOT NULL DEFAULT true,
    "subsOnly" BOOLEAN NOT NULL DEFAULT false,
    "vipsOnly" BOOLEAN NOT NULL DEFAULT false,
    "modsOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongRequestConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongRequestQueueItem" (
    "id" TEXT NOT NULL,
    "channelTwitchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "spotifyUri" TEXT NOT NULL,
    "requestedByLogin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongRequestQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SongRequestConfig_channelTwitchId_key" ON "SongRequestConfig"("channelTwitchId");

-- CreateIndex
CREATE INDEX "SongRequestConfig_userId_idx" ON "SongRequestConfig"("userId");

-- CreateIndex
CREATE INDEX "SongRequestQueueItem_channelTwitchId_createdAt_idx" ON "SongRequestQueueItem"("channelTwitchId", "createdAt");

-- AddForeignKey
ALTER TABLE "SongRequestConfig" ADD CONSTRAINT "SongRequestConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
