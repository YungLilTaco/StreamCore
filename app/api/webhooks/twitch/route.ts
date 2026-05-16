import { upsertPendingRedemptionFromEventSub, type EventSubRedemptionEvent } from "@/lib/channel-redemptions";
import { verifyTwitchEventSubSignature } from "@/lib/twitch-eventsub-webhook";

export const dynamic = "force-dynamic";

/**
 * Twitch EventSub **HTTP** callback (transport: webhook).
 *
 * Configure in Twitch Developer Console (or Helix) with the same secret as `TWITCH_EVENTSUB_WEBHOOK_SECRET`.
 * For local dev, use a tunnel (ngrok) or rely on `POST /api/twitch/channel-redemptions/ingest` from the
 * dashboard EventSub WebSocket instead.
 */
export async function POST(req: Request) {
  const secret = process.env.TWITCH_EVENTSUB_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return new Response("Webhook secret not configured", { status: 503 });
  }

  const rawBody = await req.text();
  const messageId = req.headers.get("Twitch-Eventsub-Message-Id") ?? "";
  const messageTs = req.headers.get("Twitch-Eventsub-Message-Timestamp") ?? "";
  const signature = req.headers.get("Twitch-Eventsub-Message-Signature");
  const messageType = req.headers.get("Twitch-Eventsub-Message-Type") ?? "";

  if (!verifyTwitchEventSubSignature(messageId, messageTs, rawBody, secret, signature)) {
    return new Response("invalid signature", { status: 403 });
  }

  if (messageType === "webhook_callback_verification") {
    let challenge = "";
    try {
      const j = JSON.parse(rawBody) as { challenge?: string };
      challenge = typeof j.challenge === "string" ? j.challenge : "";
    } catch {
      return new Response("invalid json", { status: 400 });
    }
    if (!challenge) return new Response("missing challenge", { status: 400 });
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  if (messageType === "notification") {
    try {
      const body = JSON.parse(rawBody) as {
        subscription?: { type?: string };
        event?: EventSubRedemptionEvent;
      };
      const subType = body.subscription?.type;
      if (subType === "channel.channel_points_custom_reward_redemption.add" && body.event) {
        await upsertPendingRedemptionFromEventSub(body.event);
      }
    } catch {
      return new Response("bad payload", { status: 400 });
    }
    return new Response("", { status: 204 });
  }

  /* revocation — acknowledge */
  return new Response("", { status: 204 });
}
