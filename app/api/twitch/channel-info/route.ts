import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProviderAccessToken } from "@/lib/tokens";

function twitchHeaders(accessToken: string) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) throw new Error("Missing TWITCH_CLIENT_ID");
  return {
    Authorization: `Bearer ${accessToken}`,
    "Client-Id": clientId
  };
}

async function assertCanAccessChannel(userId: string, channelTwitchId: string) {
  const twitchAccount = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true }
  });

  const isSelf = twitchAccount?.providerAccountId === channelTwitchId;
  if (isSelf) return { isSelf: true };

  const perm = await prisma.channelPermission.findUnique({
    where: { userId_channelTwitchId: { userId, channelTwitchId } },
    select: { role: true }
  });

  if (!perm) {
    return null;
  }
  return { isSelf: false, role: perm.role };
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

  const access = await assertCanAccessChannel(session.user.id, channelTwitchId);
  if (!access) return Response.json({ message: "Forbidden" }, { status: 403 });

  const { accessToken } = await getProviderAccessToken(session.user.id, "twitch");
  const headers = twitchHeaders(accessToken);

  // Note: GET/PUT /helix/streams/tags is decommissioned — tags live on GET/PATCH /helix/channels (`tags: string[]`).
  const channelRes = await fetch(
    `https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(channelTwitchId)}`,
    {
      headers,
      cache: "no-store"
    }
  );

  const channelText = await channelRes.text();
  if (!channelRes.ok) {
    return new Response(channelText || "Twitch error", {
      status: channelRes.status,
      headers: { "Content-Type": channelRes.headers.get("content-type") ?? "application/json" }
    });
  }

  const channelJson = JSON.parse(channelText) as any;

  const channel = (channelJson?.data?.[0] ?? null) as
    | {
        broadcaster_id: string;
        broadcaster_login: string;
        broadcaster_name: string;
        broadcaster_language: string;
        game_id: string;
        game_name: string;
        title: string;
        delay: number;
        tags?: string[];
        content_classification_labels?: string[];
      is_branded_content?: boolean;
    }
    | null;

  const tagStrings = Array.isArray(channel?.tags) ? (channel!.tags as string[]) : [];

  return Response.json({
    channelTwitchId,
    access,
    channel,
    tags: tagStrings.map((name) => ({ name }))
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { channelTwitchId?: string; title?: string; gameId?: string; tags?: string[] }
    | null;

  const channelTwitchId = body?.channelTwitchId;
  if (!channelTwitchId) {
    return Response.json({ message: "Missing channelTwitchId" }, { status: 400 });
  }

  const access = await assertCanAccessChannel(session.user.id, channelTwitchId);
  if (!access) return Response.json({ message: "Forbidden" }, { status: 403 });

  const { accessToken } = await getProviderAccessToken(session.user.id, "twitch");
  const headers = twitchHeaders(accessToken);

  const nextTitle = typeof body?.title === "string" ? body.title : undefined;
  const nextGameId = typeof body?.gameId === "string" ? body.gameId : undefined;
  const nextTags =
    Array.isArray(body?.tags) && body.tags !== undefined ? body.tags.filter((x) => typeof x === "string") : undefined;

  // Update title, category/game, stream tags via Modify Channel Information (modern `tags`, not Replace Stream Tags)
  const modifyRes = await fetch(
    `https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(channelTwitchId)}`,
    {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(nextTitle !== undefined ? { title: nextTitle } : null),
        ...(nextGameId !== undefined ? { game_id: nextGameId } : null),
        ...(nextTags !== undefined ? { tags: nextTags } : null)
      }),
      cache: "no-store"
    }
  );

  if (!modifyRes.ok) {
    const text = await modifyRes.text();
    return new Response(text || "Twitch error", {
      status: modifyRes.status,
      headers: { "Content-Type": modifyRes.headers.get("content-type") ?? "application/json" }
    });
  }

  return Response.json({ ok: true });
}

