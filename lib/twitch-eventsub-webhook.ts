import crypto from "crypto";

/**
 * Verify Twitch EventSub webhook `Twitch-Eventsub-Message-Signature` (HMAC-SHA256).
 * @see https://dev.twitch.tv/docs/eventsub/handling-webhook-events/#verifying-the-event-message
 */
export function verifyTwitchEventSubSignature(
  messageId: string,
  messageTimestamp: string,
  rawBody: string,
  secret: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !secret) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(messageId + messageTimestamp + rawBody).digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signatureHeader, "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
