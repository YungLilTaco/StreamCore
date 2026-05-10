-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelTwitchId" TEXT NOT NULL,
    "layoutsJson" TEXT NOT NULL,
    "visibleJson" TEXT NOT NULL,
    "docksLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardLayout_channelTwitchId_idx" ON "DashboardLayout"("channelTwitchId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayout_userId_channelTwitchId_key" ON "DashboardLayout"("userId", "channelTwitchId");

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
