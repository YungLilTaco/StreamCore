import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as { permissionId?: string } | null;
  const permissionId = body?.permissionId;
  if (!permissionId) return new Response("Missing permissionId", { status: 400 });

  const twitchAccount = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "twitch" },
    select: { providerAccountId: true }
  });
  if (!twitchAccount?.providerAccountId) return new Response("Missing Twitch account", { status: 400 });

  const perm = await prisma.channelPermission.findUnique({ where: { id: permissionId } });
  if (!perm) return new Response("Not found", { status: 404 });

  // Only allow managing permissions for your own channel (Phase 1).
  if (perm.channelTwitchId !== twitchAccount.providerAccountId) {
    return new Response("Forbidden", { status: 403 });
  }

  await prisma.channelPermission.delete({ where: { id: permissionId } });
  return Response.json({ ok: true });
}

