/**
 * Chat message archive — ingest (POST) and query (GET).
 *
 * Twitch's Helix API has no "messages by user" endpoint. To render real per-user chat history in
 * the user profile popover across sessions / devices, we persist every PRIVMSG we observe via
 * the IRC WebSocket into the `ChatMessageArchive` Prisma table. This route is the choke point:
 *
 *   POST → ingest a batch of messages observed since the last upload. Body is enforced small
 *           (≤ 50 rows) so a runaway client can't OOM the server; the route is upsert-by-ircId
 *           so retries are idempotent.
 *
 *   GET  → paginate the archive for a single user. Supports keyset pagination via `before` (epoch
 *           ms) for infinite-scroll-up in the popover, plus `limit` (≤ 100) and one of
 *           `userTwitchId` / `userLogin` to scope the query.
 *
 * Access policy (same for both methods): the caller must be the broadcaster (`isSelf`) OR hold a
 * `ChannelPermission` row for `channelTwitchId`. Mods who can read chat live can also read the
 * archive.
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INGEST_BATCH_CAP = 50;
const QUERY_LIMIT_DEFAULT = 50;
const QUERY_LIMIT_CAP = 100;

type IngestBody = {
  channelTwitchId?: unknown;
  messages?: unknown;
};

type IngestRow = {
  ircId?: unknown;
  userTwitchId?: unknown;
  userLogin?: unknown;
  displayName?: unknown;
  color?: unknown;
  text?: unknown;
  badges?: unknown;
  ts?: unknown;
  isMod?: unknown;
  isSubscriber?: unknown;
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

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelTwitchId = typeof body.channelTwitchId === "string" ? body.channelTwitchId : null;
  if (!channelTwitchId) return Response.json({ error: "Missing channelTwitchId" }, { status: 400 });

  const rawMessages = Array.isArray(body.messages) ? body.messages : null;
  if (!rawMessages) return Response.json({ error: "Missing messages array" }, { status: 400 });

  const ok = await assertChannelAccess(session.user.id, channelTwitchId);
  if (!ok) return Response.json({ error: "Forbidden" }, { status: 403 });

  // Bound batch size — a misbehaving client can't dump unbounded payloads into the DB.
  const batch = rawMessages.slice(0, INGEST_BATCH_CAP) as IngestRow[];

  const cleaned: {
    ircId: string;
    userTwitchId: string | null;
    userLogin: string;
    displayName: string;
    color: string | null;
    text: string;
    badges: string | null;
    ts: bigint;
    isMod: boolean;
    isSubscriber: boolean;
  }[] = [];

  for (const r of batch) {
    if (!r || typeof r !== "object") continue;
    const ircId = typeof r.ircId === "string" ? r.ircId.slice(0, 64) : null;
    const userLogin = typeof r.userLogin === "string" ? r.userLogin.toLowerCase().slice(0, 64) : null;
    const text = typeof r.text === "string" ? r.text.slice(0, 1000) : null;
    const tsRaw = typeof r.ts === "number" ? r.ts : Number(r.ts);
    if (!ircId || !userLogin || !text || !Number.isFinite(tsRaw) || tsRaw <= 0) continue;
    cleaned.push({
      ircId,
      userTwitchId: typeof r.userTwitchId === "string" && r.userTwitchId ? r.userTwitchId.slice(0, 32) : null,
      userLogin,
      displayName: typeof r.displayName === "string" ? r.displayName.slice(0, 64) : userLogin,
      color: typeof r.color === "string" && r.color ? r.color.slice(0, 16) : null,
      text,
      badges: typeof r.badges === "string" && r.badges ? r.badges.slice(0, 256) : null,
      ts: BigInt(Math.floor(tsRaw)),
      isMod: r.isMod === true,
      isSubscriber: r.isSubscriber === true
    });
  }

  if (cleaned.length === 0) return Response.json({ inserted: 0, skipped: 0 });

  /**
   * `createMany({ skipDuplicates: true })` would be more efficient, but Postgres `skipDuplicates`
   * needs the unique index to match exactly, and we want callers to see how many were genuinely
   * new vs. ignored as duplicates. Loop-upsert is fine at our batch sizes (≤ 50) and gives us a
   * tidy `inserted` count without an extra count query.
   */
  let inserted = 0;
  let skipped = 0;
  for (const row of cleaned) {
    try {
      await prisma.chatMessageArchive.create({
        data: { channelTwitchId, ...row }
      });
      inserted++;
    } catch (e: unknown) {
      // P2002 = unique constraint violation on (channelTwitchId, ircId). Expected for retries.
      const code = (e as { code?: string }).code;
      if (code === "P2002") skipped++;
      else throw e;
    }
  }

  return Response.json({ inserted, skipped });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  if (!channelTwitchId) return Response.json({ error: "Missing channelTwitchId" }, { status: 400 });

  const ok = await assertChannelAccess(session.user.id, channelTwitchId);
  if (!ok) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userTwitchId = url.searchParams.get("userTwitchId");
  const userLogin = url.searchParams.get("userLogin");
  if (!userTwitchId && !userLogin) {
    return Response.json({ error: "Provide userTwitchId or userLogin" }, { status: 400 });
  }

  const limitRaw = Number(url.searchParams.get("limit") ?? QUERY_LIMIT_DEFAULT);
  const limit = Math.max(1, Math.min(QUERY_LIMIT_CAP, Number.isFinite(limitRaw) ? limitRaw : QUERY_LIMIT_DEFAULT));

  /**
   * Keyset pagination: `before` is an exclusive upper bound on `ts` (epoch ms). The popover
   * passes the oldest currently-loaded message's `ts` to fetch the next page upwards (older).
   */
  const beforeRaw = url.searchParams.get("before");
  const beforeMs = beforeRaw != null ? Number(beforeRaw) : NaN;
  const tsFilter = Number.isFinite(beforeMs) && beforeMs > 0 ? { lt: BigInt(Math.floor(beforeMs)) } : undefined;

  const includeDeleted = url.searchParams.get("includeDeleted") === "1";

  const where = {
    channelTwitchId,
    ...(userTwitchId ? { userTwitchId } : {}),
    ...(userTwitchId ? {} : { userLogin: (userLogin as string).toLowerCase() }),
    ...(tsFilter ? { ts: tsFilter } : {}),
    ...(includeDeleted ? {} : { deletedAt: null })
  };

  const rows = await prisma.chatMessageArchive.findMany({
    where,
    orderBy: [{ ts: "desc" }, { id: "desc" }],
    take: limit
  });

  // Return chronologically ascending so the UI can prepend pages naturally as the user scrolls up.
  const items = rows
    .map((r) => ({
      id: r.id,
      ircId: r.ircId,
      userTwitchId: r.userTwitchId,
      userLogin: r.userLogin,
      displayName: r.displayName,
      color: r.color,
      text: r.text,
      badges: r.badges,
      ts: Number(r.ts),
      isMod: r.isMod,
      isSubscriber: r.isSubscriber,
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null
    }))
    .reverse();

  // The next "before" cursor is the oldest ts we returned (only meaningful if we hit the limit).
  const nextBefore = rows.length === limit && items.length > 0 ? items[0]!.ts : null;

  return Response.json({ items, nextBefore });
}
