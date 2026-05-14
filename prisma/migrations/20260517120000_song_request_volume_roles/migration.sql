-- Built-in !volume command: role gates (mirrors song-request flags; defaults = permissive).
ALTER TABLE "SongRequestConfig" ADD COLUMN "volumeAllowEveryone" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SongRequestConfig" ADD COLUMN "volumeSubsOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SongRequestConfig" ADD COLUMN "volumeVipsOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SongRequestConfig" ADD COLUMN "volumeModsOnly" BOOLEAN NOT NULL DEFAULT false;
