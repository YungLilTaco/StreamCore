import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const twitchAccount = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "twitch" },
    select: { providerAccountId: true }
  });

  const perms = await prisma.channelPermission.findMany({
    where: {
      userId: session.user.id,
      role: { in: ["EDITOR", "FULL_CONTROL"] }
    },
    orderBy: [{ channelDisplayName: "asc" }]
  });

  const self = twitchAccount?.providerAccountId
    ? {
        channelTwitchId: twitchAccount.providerAccountId,
        channelDisplayName: session.user.name ?? "My channel",
        role: "OWNER",
        isSelf: true
      }
    : null;

  const channels = [
    ...(self ? [self] : []),
    ...perms.map((p) => ({
      channelTwitchId: p.channelTwitchId,
      channelDisplayName: p.channelDisplayName,
      role: p.role
    }))
  ];

  return Response.json({ channels });
}

