-- Per-dock lock flags (JSON object: { "streamPreview": true, ... })
ALTER TABLE "DashboardLayout" ADD COLUMN "docksLockedJson" TEXT NOT NULL DEFAULT '{}';

ALTER TABLE "DashboardLayout" DROP COLUMN "docksLocked";
