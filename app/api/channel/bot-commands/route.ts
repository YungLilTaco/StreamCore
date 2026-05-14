import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Owns the per-channel BotCommand catalog for StreamCoreHelper.
 *
 * Authorization model: only the broadcaster (the user whose linked Twitch `Account.providerAccountId`
 * matches `channelTwitchId`) can read or mutate this list. Editors with `ChannelPermission` rows are
 * deliberately *not* given write access here — bot command edits affect what runs on the channel's
 * IRC connection, which is a privileged surface we keep self-only until a dedicated permission role
 * is added.
 */
async function assertOwnChannel(userId: string, channelTwitchId: string): Promise<boolean> {
  const tw = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true }
  });
  return Boolean(tw?.providerAccountId && tw.providerAccountId === channelTwitchId);
}

/** Conservative trigger validator — chat commands are typically letters/digits/dash/underscore. */
function normalizeTrigger(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 32) return null;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(trimmed)) return null;
  return trimmed;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  if (!channelTwitchId) return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });

  if (!(await assertOwnChannel(session.user.id, channelTwitchId))) {
    return Response.json({ message: "Bot commands are only editable on your own channel." }, { status: 403 });
  }

  const commands = await prisma.botCommand.findMany({
    where: { channelTwitchId },
    orderBy: [{ enabled: "desc" }, { trigger: "asc" }],
    select: {
      id: true,
      trigger: true,
      response: true,
      enabled: true,
      cooldownSec: true,
      modOnly: true,
      updatedAt: true
    }
  });

  return Response.json({ commands });
}

type PostBody = {
  channelTwitchId?: string;
  trigger?: string;
  response?: string;
  enabled?: boolean;
  cooldownSec?: number;
  modOnly?: boolean;
} | null;

/** Upsert a single command by (channelTwitchId, trigger). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PostBody;
  const channelTwitchId = typeof body?.channelTwitchId === "string" ? body.channelTwitchId : null;
  if (!channelTwitchId) return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });

  if (!(await assertOwnChannel(session.user.id, channelTwitchId))) {
    return Response.json({ message: "Bot commands are only editable on your own channel." }, { status: 403 });
  }

  const trigger = normalizeTrigger(body?.trigger);
  if (!trigger) {
    return Response.json(
      { message: "Trigger must be 1-32 chars: letters, digits, dash or underscore." },
      { status: 400 }
    );
  }

  const response = typeof body?.response === "string" ? body!.response.trim() : "";
  if (response.length === 0 || response.length > 500) {
    return Response.json({ message: "Response must be 1-500 characters." }, { status: 400 });
  }

  const enabled = typeof body?.enabled === "boolean" ? body.enabled : true;
  const modOnly = typeof body?.modOnly === "boolean" ? body.modOnly : false;
  const cdRaw = typeof body?.cooldownSec === "number" ? body.cooldownSec : 5;
  const cooldownSec = Math.max(0, Math.min(3600, Math.round(cdRaw)));

  const row = await prisma.botCommand.upsert({
    where: { channelTwitchId_trigger: { channelTwitchId, trigger } },
    create: {
      userId: session.user.id,
      channelTwitchId,
      trigger,
      response,
      enabled,
      cooldownSec,
      modOnly
    },
    update: { response, enabled, cooldownSec, modOnly },
    select: {
      id: true,
      trigger: true,
      response: true,
      enabled: true,
      cooldownSec: true,
      modOnly: true,
      updatedAt: true
    }
  });

  return Response.json({ command: row });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  const trigger = normalizeTrigger(url.searchParams.get("trigger"));
  if (!channelTwitchId || !trigger) {
    return Response.json({ message: "Missing channelTwitchId or trigger" }, { status: 400 });
  }

  if (!(await assertOwnChannel(session.user.id, channelTwitchId))) {
    return Response.json({ message: "Bot commands are only editable on your own channel." }, { status: 403 });
  }

  await prisma.botCommand
    .delete({ where: { channelTwitchId_trigger: { channelTwitchId, trigger } } })
    .catch(() => null);

  return Response.json({ ok: true });
}
