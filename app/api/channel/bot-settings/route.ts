import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
    return Response.json({ message: "Bot settings are only editable on your own channel." }, { status: 403 });
  }

  const row = await prisma.botSettings.findUnique({
    where: { channelTwitchId },
    select: {
      enabled: true,
      prefix: true,
      prefixRepliesAsHelper: true,
      greetingEnabled: true,
      greetingMessage: true,
      updatedAt: true
    }
  });

  return Response.json({
    settings: row ?? {
      enabled: true,
      prefix: "!",
      prefixRepliesAsHelper: false,
      greetingEnabled: false,
      greetingMessage: null,
      updatedAt: null
    }
  });
}

type PostBody = {
  channelTwitchId?: string;
  enabled?: boolean;
  prefix?: string;
  prefixRepliesAsHelper?: boolean;
  greetingEnabled?: boolean;
  greetingMessage?: string | null;
} | null;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PostBody;
  const channelTwitchId = typeof body?.channelTwitchId === "string" ? body.channelTwitchId : null;
  if (!channelTwitchId) return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });

  if (!(await assertOwnChannel(session.user.id, channelTwitchId))) {
    return Response.json({ message: "Bot settings are only editable on your own channel." }, { status: 403 });
  }

  // Normalize each optional field independently — passing `undefined` leaves it untouched.
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : undefined;
  const prefixRepliesAsHelper =
    typeof body?.prefixRepliesAsHelper === "boolean" ? body.prefixRepliesAsHelper : undefined;
  const greetingEnabled = typeof body?.greetingEnabled === "boolean" ? body.greetingEnabled : undefined;

  let prefix: string | undefined;
  if (typeof body?.prefix === "string") {
    const trimmed = body.prefix.trim();
    if (trimmed.length === 0 || trimmed.length > 3) {
      return Response.json({ message: "Prefix must be 1-3 characters." }, { status: 400 });
    }
    prefix = trimmed;
  }

  let greetingMessage: string | null | undefined;
  if (body && "greetingMessage" in body) {
    const raw = body.greetingMessage;
    if (raw === null) greetingMessage = null;
    else if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > 500) {
        return Response.json({ message: "Greeting message too long (500 max)." }, { status: 400 });
      }
      greetingMessage = trimmed.length ? trimmed : null;
    }
  }

  const existing = await prisma.botSettings.findUnique({
    where: { channelTwitchId },
    select: {
      enabled: true,
      prefix: true,
      prefixRepliesAsHelper: true,
      greetingEnabled: true,
      greetingMessage: true
    }
  });

  const nextEnabled = enabled ?? existing?.enabled ?? true;
  const nextPrefix = prefix ?? existing?.prefix ?? "!";
  const nextPrefixRepliesAsHelper =
    prefixRepliesAsHelper ?? existing?.prefixRepliesAsHelper ?? false;
  const nextGreetingEnabled = greetingEnabled ?? existing?.greetingEnabled ?? false;
  const nextGreetingMessage =
    greetingMessage !== undefined ? greetingMessage : existing?.greetingMessage ?? null;

  const row = await prisma.botSettings.upsert({
    where: { channelTwitchId },
    create: {
      userId: session.user.id,
      channelTwitchId,
      enabled: nextEnabled,
      prefix: nextPrefix,
      prefixRepliesAsHelper: nextPrefixRepliesAsHelper,
      greetingEnabled: nextGreetingEnabled,
      greetingMessage: nextGreetingMessage
    },
    update: {
      enabled: nextEnabled,
      prefix: nextPrefix,
      prefixRepliesAsHelper: nextPrefixRepliesAsHelper,
      greetingEnabled: nextGreetingEnabled,
      greetingMessage: nextGreetingMessage
    },
    select: {
      enabled: true,
      prefix: true,
      prefixRepliesAsHelper: true,
      greetingEnabled: true,
      greetingMessage: true,
      updatedAt: true
    }
  });

  return Response.json({ settings: row });
}
