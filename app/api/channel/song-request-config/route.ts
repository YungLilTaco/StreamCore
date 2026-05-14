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
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  if (!channelTwitchId) {
    return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });
  }

  const ok = await assertOwnChannel(session.user.id, channelTwitchId);
  if (!ok) {
    return Response.json({ message: "Song request settings are only editable on your own channel." }, { status: 403 });
  }

  const row = await prisma.songRequestConfig.findUnique({
    where: { channelTwitchId },
    select: {
      channelTwitchId: true,
      channelPointsRewardId: true,
      allowEveryone: true,
      subsOnly: true,
      vipsOnly: true,
      modsOnly: true,
      volumeAllowEveryone: true,
      volumeSubsOnly: true,
      volumeVipsOnly: true,
      volumeModsOnly: true,
      updatedAt: true
    }
  });

  return Response.json({ config: row });
}

type Body = {
  channelTwitchId?: string;
  channelPointsRewardId?: string | null;
  allowEveryone?: boolean;
  subsOnly?: boolean;
  vipsOnly?: boolean;
  modsOnly?: boolean;
  volumeAllowEveryone?: boolean;
  volumeSubsOnly?: boolean;
  volumeVipsOnly?: boolean;
  volumeModsOnly?: boolean;
} | null;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body;
  const channelTwitchId = typeof body?.channelTwitchId === "string" ? body.channelTwitchId : null;
  if (!channelTwitchId) {
    return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });
  }

  const ok = await assertOwnChannel(session.user.id, channelTwitchId);
  if (!ok) {
    return Response.json({ message: "Song request settings are only editable on your own channel." }, { status: 403 });
  }

  const hasReward = body && "channelPointsRewardId" in body;
  const hasFlags =
    typeof body?.allowEveryone === "boolean" ||
    typeof body?.subsOnly === "boolean" ||
    typeof body?.vipsOnly === "boolean" ||
    typeof body?.modsOnly === "boolean";
  const hasVolumeFlags =
    typeof body?.volumeAllowEveryone === "boolean" ||
    typeof body?.volumeSubsOnly === "boolean" ||
    typeof body?.volumeVipsOnly === "boolean" ||
    typeof body?.volumeModsOnly === "boolean";

  if (!hasReward && !hasFlags && !hasVolumeFlags) {
    return Response.json({ message: "Nothing to update" }, { status: 400 });
  }

  let reward: string | null | undefined;
  if (hasReward) {
    const raw = body!.channelPointsRewardId;
    if (raw === null || raw === undefined) reward = null;
    else if (typeof raw === "string") {
      const t = raw.trim();
      if (t.length > 128) return Response.json({ message: "channelPointsRewardId too long" }, { status: 400 });
      reward = t.length ? t : null;
    } else {
      return Response.json({ message: "Invalid channelPointsRewardId" }, { status: 400 });
    }
  }

  const existing = await prisma.songRequestConfig.findUnique({
    where: { channelTwitchId },
    select: {
      allowEveryone: true,
      subsOnly: true,
      vipsOnly: true,
      modsOnly: true,
      volumeAllowEveryone: true,
      volumeSubsOnly: true,
      volumeVipsOnly: true,
      volumeModsOnly: true,
      channelPointsRewardId: true
    }
  });

  const nextAllow = typeof body?.allowEveryone === "boolean" ? body.allowEveryone : (existing?.allowEveryone ?? true);
  const nextSubs = typeof body?.subsOnly === "boolean" ? body.subsOnly : (existing?.subsOnly ?? false);
  const nextVips = typeof body?.vipsOnly === "boolean" ? body.vipsOnly : (existing?.vipsOnly ?? false);
  const nextMods = typeof body?.modsOnly === "boolean" ? body.modsOnly : (existing?.modsOnly ?? false);
  const nextVolAllow =
    typeof body?.volumeAllowEveryone === "boolean"
      ? body.volumeAllowEveryone
      : (existing?.volumeAllowEveryone ?? true);
  const nextVolSubs =
    typeof body?.volumeSubsOnly === "boolean" ? body.volumeSubsOnly : (existing?.volumeSubsOnly ?? false);
  const nextVolVips =
    typeof body?.volumeVipsOnly === "boolean" ? body.volumeVipsOnly : (existing?.volumeVipsOnly ?? false);
  const nextVolMods =
    typeof body?.volumeModsOnly === "boolean" ? body.volumeModsOnly : (existing?.volumeModsOnly ?? false);
  const nextReward =
    hasReward && reward !== undefined ? reward : (existing?.channelPointsRewardId ?? null);

  await prisma.songRequestConfig.upsert({
    where: { channelTwitchId },
    create: {
      userId: session.user.id,
      channelTwitchId,
      allowEveryone: nextAllow,
      subsOnly: nextSubs,
      vipsOnly: nextVips,
      modsOnly: nextMods,
      volumeAllowEveryone: nextVolAllow,
      volumeSubsOnly: nextVolSubs,
      volumeVipsOnly: nextVolVips,
      volumeModsOnly: nextVolMods,
      channelPointsRewardId: nextReward
    },
    update: {
      allowEveryone: nextAllow,
      subsOnly: nextSubs,
      vipsOnly: nextVips,
      modsOnly: nextMods,
      volumeAllowEveryone: nextVolAllow,
      volumeSubsOnly: nextVolSubs,
      volumeVipsOnly: nextVolVips,
      volumeModsOnly: nextVolMods,
      channelPointsRewardId: nextReward
    }
  });

  return Response.json({ ok: true });
}
