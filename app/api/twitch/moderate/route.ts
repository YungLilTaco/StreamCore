/**
 * Moderation actions invoked from the user profile popover.
 *
 * Body shape (POST JSON):
 *   { action: "ban" | "timeout" | "unban" | "warn",
 *     channelTwitchId: string,
 *     userTwitchId: string,
 *     durationSec?: number,   // required for "timeout"; 1..1209600
 *     reason?: string }       // optional for ban/timeout/warn
 *
 * All four use the bearer-token user as the `moderator_id` query param required by Twitch.
 * The caller must either be the broadcaster (`isSelf`) or hold a row in `ChannelPermission`
 * with a moderator role (we trust Twitch for the final scope/role enforcement — our DB row
 * just gates access to the API).
 *
 * Scopes:
 *   - ban/timeout/unban → moderator:manage:banned_users
 *   - warn              → moderator:manage:warnings
 *
 * Responses bubble Twitch's HTTP status + `message` payload directly so the popover can show
 * the exact reason (e.g. "moderator is not authorized" if a non-mod tries to ban).
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProviderAccessToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModerationAction = "ban" | "timeout" | "unban" | "warn";

type Body = {
  action?: unknown;
  channelTwitchId?: unknown;
  userTwitchId?: unknown;
  durationSec?: unknown;
  reason?: unknown;
};

function twitchHeaders(token: string): Record<string, string> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) throw new Error("Missing TWITCH_CLIENT_ID");
  return { Authorization: `Bearer ${token}`, "Client-Id": clientId };
}

async function ownTwitchId(userId: string): Promise<string | null> {
  const row = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
    select: { providerAccountId: true }
  });
  return row?.providerAccountId ?? null;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as ModerationAction | undefined;
  const channelTwitchId = typeof body.channelTwitchId === "string" ? body.channelTwitchId : null;
  const userTwitchId = typeof body.userTwitchId === "string" ? body.userTwitchId : null;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : undefined;
  const durationSec = typeof body.durationSec === "number" ? Math.floor(body.durationSec) : null;

  if (!action || !["ban", "timeout", "unban", "warn"].includes(action)) {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!channelTwitchId || !userTwitchId) {
    return Response.json({ error: "Missing channelTwitchId or userTwitchId" }, { status: 400 });
  }
  if (action === "timeout" && (durationSec === null || durationSec < 1 || durationSec > 1_209_600)) {
    return Response.json({ error: "Timeout duration must be 1..1209600 seconds" }, { status: 400 });
  }

  // Access check.
  const ownId = await ownTwitchId(session.user.id);
  const isSelf = ownId === channelTwitchId;
  if (!isSelf) {
    const perm = await prisma.channelPermission.findUnique({
      where: { userId_channelTwitchId: { userId: session.user.id, channelTwitchId } },
      select: { role: true }
    });
    if (!perm) return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // Twitch wants the moderator's user_id; for self-mod that's the broadcaster.
  const moderatorId = ownId || channelTwitchId;

  let token: string;
  try {
    ({ accessToken: token } = await getProviderAccessToken(session.user.id, "twitch"));
  } catch {
    return Response.json({ error: "No Twitch token" }, { status: 401 });
  }

  const baseHeaders = { ...twitchHeaders(token), "Content-Type": "application/json" };

  if (action === "ban" || action === "timeout") {
    const data: Record<string, unknown> = { user_id: userTwitchId };
    if (action === "timeout") data.duration = durationSec;
    if (reason) data.reason = reason;

    const res = await fetch(
      `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${encodeURIComponent(channelTwitchId)}&moderator_id=${encodeURIComponent(moderatorId)}`,
      { method: "POST", headers: baseHeaders, body: JSON.stringify({ data }), cache: "no-store" }
    );
    if (!res.ok) {
      const text = await res.text();
      return new Response(text || JSON.stringify({ error: `HTTP ${res.status}` }), {
        status: res.status,
        headers: { "Content-Type": "application/json" }
      });
    }
    const json = (await res.json()) as {
      data?: { broadcaster_id: string; user_id: string; created_at: string; end_time: string | null }[];
    };
    return Response.json({ action, result: json.data?.[0] ?? null });
  }

  if (action === "unban") {
    const res = await fetch(
      `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${encodeURIComponent(channelTwitchId)}&moderator_id=${encodeURIComponent(moderatorId)}&user_id=${encodeURIComponent(userTwitchId)}`,
      { method: "DELETE", headers: twitchHeaders(token), cache: "no-store" }
    );
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      return new Response(text || JSON.stringify({ error: `HTTP ${res.status}` }), {
        status: res.status,
        headers: { "Content-Type": "application/json" }
      });
    }
    return Response.json({ action, result: null });
  }

  // warn
  const res = await fetch(
    `https://api.twitch.tv/helix/moderation/warnings?broadcaster_id=${encodeURIComponent(channelTwitchId)}&moderator_id=${encodeURIComponent(moderatorId)}`,
    {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ data: { user_id: userTwitchId, reason: reason || "Warning" } }),
      cache: "no-store"
    }
  );
  if (!res.ok) {
    const text = await res.text();
    return new Response(text || JSON.stringify({ error: `HTTP ${res.status}` }), {
      status: res.status,
      headers: { "Content-Type": "application/json" }
    });
  }
  const json = (await res.json()) as {
    data?: { broadcaster_id: string; user_id: string; reason: string; created_at: string }[];
  };
  return Response.json({ action, result: json.data?.[0] ?? null });
}
