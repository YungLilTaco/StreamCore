import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Song-request queue management API.
 *
 * GET    /api/channel/song-request-queue?channelTwitchId=…   → ordered queue (oldest first)
 * POST   /api/channel/song-request-queue                      → add a manual entry
 * DELETE /api/channel/song-request-queue?id=…&channelTwitchId=…  → remove a single entry
 *         /api/channel/song-request-queue?channelTwitchId=…&all=1  → clear the entire queue
 *
 * Authorization mirrors the song-request-config route: only the channel owner (the user whose
 * linked Twitch account matches `channelTwitchId`) can read/modify. We re-check on every call so
 * a viewer who slipped past the dashboard's channel-picker UI cannot mutate someone else's queue.
 */
async function assertOwnChannel(userId: string, channelTwitchId: string): Promise<boolean> {
  const tw = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true }
  });
  return Boolean(tw?.providerAccountId && tw.providerAccountId === channelTwitchId);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  if (!channelTwitchId) return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });

  if (!(await assertOwnChannel(session.user.id, channelTwitchId))) {
    return Response.json({ message: "Song request queue is only viewable on your own channel." }, { status: 403 });
  }

  const queue = await prisma.songRequestQueueItem.findMany({
    where: { channelTwitchId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      artist: true,
      spotifyUri: true,
      requestedByLogin: true,
      createdAt: true
    }
  });

  return Response.json({ queue });
}

type PostBody = {
  channelTwitchId?: string;
  title?: string;
  artist?: string;
  spotifyUri?: string;
  requestedByLogin?: string;
} | null;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PostBody;
  const channelTwitchId = typeof body?.channelTwitchId === "string" ? body.channelTwitchId : null;
  if (!channelTwitchId) return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });

  if (!(await assertOwnChannel(session.user.id, channelTwitchId))) {
    return Response.json({ message: "Song request queue is only editable on your own channel." }, { status: 403 });
  }

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
  const spotifyUri = typeof body?.spotifyUri === "string" ? body.spotifyUri.trim() : "";
  const requestedByLogin =
    typeof body?.requestedByLogin === "string" && body.requestedByLogin.trim().length
      ? body.requestedByLogin.trim().toLowerCase()
      : session.user.name?.toLowerCase() ?? "manual";

  if (!title || !artist || !spotifyUri) {
    return Response.json({ message: "title, artist and spotifyUri are required." }, { status: 400 });
  }
  if (title.length > 240 || artist.length > 240 || spotifyUri.length > 240) {
    return Response.json({ message: "Fields too long." }, { status: 400 });
  }

  const row = await prisma.songRequestQueueItem.create({
    data: { channelTwitchId, title, artist, spotifyUri, requestedByLogin },
    select: { id: true, title: true, artist: true, spotifyUri: true, requestedByLogin: true, createdAt: true }
  });

  return Response.json({ item: row });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  const id = url.searchParams.get("id");
  const all = url.searchParams.get("all") === "1";
  if (!channelTwitchId) return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });

  if (!(await assertOwnChannel(session.user.id, channelTwitchId))) {
    return Response.json({ message: "Song request queue is only editable on your own channel." }, { status: 403 });
  }

  if (all) {
    const { count } = await prisma.songRequestQueueItem.deleteMany({ where: { channelTwitchId } });
    return Response.json({ ok: true, removed: count });
  }

  if (!id) return Response.json({ message: "Missing id (or pass all=1)" }, { status: 400 });

  await prisma.songRequestQueueItem
    .deleteMany({ where: { id, channelTwitchId } })
    .catch(() => null);

  return Response.json({ ok: true });
}
