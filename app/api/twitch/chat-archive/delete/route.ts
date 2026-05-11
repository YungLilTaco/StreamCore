/**
 * Chat archive soft-delete endpoint.
 *
 * Companion to `/api/twitch/chat-archive` (ingest + query). Twitch IRC's CLEARMSG and CLEARCHAT
 * events fire when a moderator deletes a single line, times a user out, or bans them. We do NOT
 * remove rows from the archive — instead we set `deletedAt` so:
 *
 *   1. The live `LiveChatDock` can render "Message deleted by moderator" with a "(show)" reveal.
 *   2. The user-profile popover's Messages tab can render historical rows greyed out + struck
 *      through, matching Twitch's mod-view UX.
 *
 * Request shapes:
 *   { channelTwitchId, ircId }     — single CLEARMSG.
 *   { channelTwitchId, userLogin } — CLEARCHAT for a specific user (timeout or ban). Marks all of
 *                                    that user's currently-undeleted rows in the channel.
 *
 * Channel-wide CLEARCHAT (`/clear`) is intentionally NOT honoured here: Twitch's own clear only
 * affects the live viewer state — historical messages remain on the platform. We mirror that
 * semantic in the archive to avoid permanently obscuring chat history that nobody actually
 * moderated.
 *
 * Access policy mirrors the rest of the chat-archive routes: broadcaster (`isSelf`) OR a
 * `ChannelPermission` row for `channelTwitchId`.
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeleteBody = {
  channelTwitchId?: unknown;
  ircId?: unknown;
  userLogin?: unknown;
  allInChannel?: unknown;
};

async function assertChannelAccess(userId: string, channelTwitchId: string): Promise<boolean> {
  const own = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true }
  });
  if (own?.providerAccountId === channelTwitchId) return true;
  const perm = await prisma.channelPermission.findUnique({
    where: { userId_channelTwitchId: { userId, channelTwitchId } },
    select: { role: true }
  });
  return !!perm;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelTwitchId = typeof body.channelTwitchId === "string" ? body.channelTwitchId : null;
  if (!channelTwitchId) return Response.json({ error: "Missing channelTwitchId" }, { status: 400 });

  const ircId = typeof body.ircId === "string" && body.ircId ? body.ircId.slice(0, 64) : null;
  const userLogin =
    typeof body.userLogin === "string" && body.userLogin ? body.userLogin.toLowerCase().slice(0, 64) : null;

  if (!ircId && !userLogin) {
    // Channel-wide /clear or malformed request — we don't persist either case (see file docblock).
    return Response.json({ updated: 0 });
  }

  const ok = await assertChannelAccess(session.user.id, channelTwitchId);
  if (!ok) return Response.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();

  if (ircId) {
    // Single CLEARMSG. Update only if not already marked so we don't churn the row needlessly.
    const result = await prisma.chatMessageArchive.updateMany({
      where: { channelTwitchId, ircId, deletedAt: null },
      data: { deletedAt: now }
    });
    return Response.json({ updated: result.count });
  }

  // CLEARCHAT for a user — mark all of their archived rows in this channel as deleted.
  const result = await prisma.chatMessageArchive.updateMany({
    where: { channelTwitchId, userLogin: userLogin!, deletedAt: null },
    data: { deletedAt: now }
  });
  return Response.json({ updated: result.count });
}
