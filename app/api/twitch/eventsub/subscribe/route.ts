/**
 * Register Twitch EventSub WebSocket subscriptions for a client-opened WS session.
 *
 * Flow:
 *  1. Browser opens WS to `wss://eventsub.wss.twitch.tv/ws`
 *  2. On `session_welcome`, browser POSTs `{ sessionId, channelTwitchId }` here.
 *  3. We validate the bearer token, force-refresh it once if `/oauth2/validate` says it's revoked,
 *     read the live granted scopes from `/oauth2/validate`, and register every
 *     `EVENTSUB_SUBSCRIPTION_DEFS` entry whose scopes the user has.
 *  4. Twitch delivers `notification` messages over the user's WS until they close it.
 *
 * Auto-cleanup: when the WS closes, Twitch removes all subscriptions tied to that session — no
 * server-side DELETE call is necessary.
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { forceRefreshProviderToken, getProviderAccessToken } from "@/lib/tokens";
import { EVENTSUB_SUBSCRIPTION_DEFS } from "@/lib/twitch-eventsub-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscribeBody = {
  sessionId?: unknown;
  channelTwitchId?: unknown;
};

type SubResult =
  | { type: string; ok: true; status: number }
  | { type: string; ok: false; status: number; message: string };

function twitchHeaders(token: string): Record<string, string> {
  const cid = process.env.TWITCH_CLIENT_ID;
  if (!cid) throw new Error("Missing TWITCH_CLIENT_ID");
  return {
    Authorization: `Bearer ${token}`,
    "Client-Id": cid
  };
}

async function readGrantedScopes(accessToken: string): Promise<string[] | null> {
  try {
    const r = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${accessToken}` },
      cache: "no-store"
    });
    if (!r.ok) return null;
    const json = (await r.json()) as { scopes?: string[] };
    return Array.isArray(json.scopes) ? json.scopes : [];
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  const channelTwitchId = typeof body.channelTwitchId === "string" ? body.channelTwitchId : null;
  if (!sessionId || !channelTwitchId) {
    return Response.json({ error: "Missing sessionId or channelTwitchId" }, { status: 400 });
  }

  /**
   * EventSub WebSocket subscriptions for these types only work when the bearer token belongs to
   * the broadcaster. Block early so users selecting another moderated channel see a clear reason
   * (instead of dozens of confusing 401s from Helix).
   */
  const twAcc = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "twitch" },
    select: { providerAccountId: true }
  });
  if (!twAcc || twAcc.providerAccountId !== channelTwitchId) {
    return Response.json(
      {
        error: "EventSub WebSocket subscriptions only work on your own Twitch channel.",
        succeeded: 0,
        failed: [] as SubResult[]
      },
      { status: 403 }
    );
  }

  let accessToken: string;
  try {
    ({ accessToken } = await getProviderAccessToken(session.user.id, "twitch"));
  } catch {
    return Response.json({ error: "No Twitch token; sign in again." }, { status: 401 });
  }

  // Validate → if Twitch says token is bad, force-refresh once and retry.
  let scopes = await readGrantedScopes(accessToken);
  if (scopes === null) {
    try {
      const refreshed = await forceRefreshProviderToken(session.user.id, "twitch");
      accessToken = refreshed.accessToken;
      scopes = await readGrantedScopes(accessToken);
    } catch {
      return Response.json(
        { error: "Twitch token is revoked. Sign out and sign in again." },
        { status: 401 }
      );
    }
  }
  if (scopes === null) {
    return Response.json(
      { error: "Twitch token validation failed. Sign out and sign in again." },
      { status: 401 }
    );
  }

  const scopeSet = new Set(scopes);
  const hasAny = (any: string[]) => any.length === 0 || any.some((s) => scopeSet.has(s));

  const headers = twitchHeaders(accessToken);
  const results: SubResult[] = [];

  for (const def of EVENTSUB_SUBSCRIPTION_DEFS) {
    if (!hasAny(def.requiredAnyScope)) {
      results.push({
        type: def.type,
        ok: false,
        status: 0,
        message: `Missing scope (any of: ${def.requiredAnyScope.join(", ")})`
      });
      continue;
    }

    try {
      const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: def.type,
          version: def.version,
          condition: def.condition(channelTwitchId),
          transport: { method: "websocket", session_id: sessionId }
        }),
        cache: "no-store"
      });

      // 202 = accepted, 200 = created — either is success. 409 = already exists for this session (idempotent).
      if (res.ok || res.status === 202 || res.status === 409) {
        results.push({ type: def.type, ok: true, status: res.status });
      } else {
        let message = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { message?: string };
          if (j.message) message = j.message;
        } catch {
          /* ignore */
        }
        results.push({ type: def.type, ok: false, status: res.status, message });
      }
    } catch (e) {
      results.push({
        type: def.type,
        ok: false,
        status: 0,
        message: (e as Error).message || "Network error"
      });
    }
  }

  const succeeded = results.filter((r): r is Extract<SubResult, { ok: true }> => r.ok).length;
  const failed = results.filter((r): r is Extract<SubResult, { ok: false }> => !r.ok);

  return Response.json({
    sessionId,
    succeeded,
    failed,
    grantedScopes: scopes
  });
}
