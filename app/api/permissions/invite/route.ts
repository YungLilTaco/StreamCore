import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { role?: "BASIC_EDITOR" | "EDITOR" | "FULL_CONTROL"; expiresInHours?: number | null }
    | null;

  const role = body?.role ?? "EDITOR";
  const expiresInHours = body?.expiresInHours ?? 168;

  const twitchAccount = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "twitch" },
    select: { providerAccountId: true }
  });
  if (!twitchAccount?.providerAccountId) {
    return new Response("Missing Twitch account", { status: 400 });
  }

  const token = randomUUID().replace(/-/g, "");
  const expiresAt =
    typeof expiresInHours === "number" && expiresInHours > 0
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

  const invite = await prisma.permissionInvite.create({
    data: {
      token,
      channelTwitchId: twitchAccount.providerAccountId,
      channelDisplayName: session.user.name ?? "My channel",
      role,
      createdByUserId: session.user.id,
      expiresAt
    }
  });

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/invite/${invite.token}`;

  return Response.json({ url });
}

