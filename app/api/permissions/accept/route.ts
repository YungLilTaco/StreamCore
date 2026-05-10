import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token;
  if (!token) return new Response("Missing token", { status: 400 });

  const invite = await prisma.permissionInvite.findUnique({ where: { token } });
  if (!invite) return new Response("Invite not found", { status: 404 });
  if (invite.usedAt) return new Response("Invite already used", { status: 409 });
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    return new Response("Invite expired", { status: 410 });
  }

  await prisma.$transaction([
    prisma.channelPermission.upsert({
      where: {
        userId_channelTwitchId: { userId: session.user.id, channelTwitchId: invite.channelTwitchId }
      },
      update: { role: invite.role, channelDisplayName: invite.channelDisplayName },
      create: {
        userId: session.user.id,
        channelTwitchId: invite.channelTwitchId,
        channelDisplayName: invite.channelDisplayName,
        role: invite.role
      }
    }),
    prisma.permissionInvite.update({
      where: { token },
      data: { usedAt: new Date(), usedByUserId: session.user.id }
    })
  ]);

  return Response.json({ ok: true });
}

