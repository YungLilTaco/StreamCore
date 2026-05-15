/**
 * StreamCore — 24/7 Twitch IRC worker (run outside the Next.js tab).
 *
 * Identity (STREAMCORE_BOT_IDENTITY_MODE):
 *   helper      — STREAMCORE_HELPER_TOKEN (+ optional STREAMCORE_BOT_TWITCH_USERNAME)
 *   broadcaster — USER_OAUTH_TOKEN (+ optional STREAMCORE_BOT_TWITCH_USERNAME)
 *
 * Usage: node scripts/prisma-env.mjs exec node scripts/streamcore-bot-irc.mjs
 * Or:    node --env-file=.env.local scripts/streamcore-bot-irc.mjs
 */
import tmi from "tmi.js";

const identityMode = (process.env.STREAMCORE_BOT_IDENTITY_MODE ?? "helper").trim().toLowerCase();
const channel = process.env.STREAMCORE_BOT_CHANNEL?.trim()?.toLowerCase();

const helperToken = process.env.STREAMCORE_HELPER_TOKEN?.trim();
const broadcasterToken = process.env.USER_OAUTH_TOKEN?.trim();
const legacyToken = process.env.STREAMCORE_BOT_TWITCH_OAUTH?.trim();

const passwordRaw =
  identityMode === "broadcaster"
    ? broadcasterToken ?? legacyToken
    : helperToken ?? legacyToken;

const username =
  process.env.STREAMCORE_BOT_TWITCH_USERNAME?.trim() ||
  (identityMode === "broadcaster"
    ? process.env.TWITCH_BROADCASTER_LOGIN?.trim()
    : process.env.STREAMCORE_HELPER_LOGIN?.trim());

if (!username || !passwordRaw || !channel) {
  console.error(
    `Missing credentials for identity_mode=${identityMode}. Need STREAMCORE_BOT_CHANNEL, ` +
      `STREAMCORE_BOT_TWITCH_USERNAME, and ` +
      (identityMode === "broadcaster" ? "USER_OAUTH_TOKEN" : "STREAMCORE_HELPER_TOKEN") +
      " (or legacy STREAMCORE_BOT_TWITCH_OAUTH)."
  );
  process.exit(1);
}

const password = passwordRaw.startsWith("oauth:") ? passwordRaw : `oauth:${passwordRaw}`;

const client = new tmi.Client({
  options: { debug: process.env.BOT_DEBUG === "true" },
  identity: { username, password },
  channels: [channel]
});

client.on("message", (ch, tags, message, self) => {
  if (self) return;
  console.log(`[${ch}] <${tags["display-name"] ?? "?"}> ${message}`);
});

client.on("connected", (addr, port) => {
  console.log(`${username} connected ${addr}:${port} → #${channel} (${identityMode})`);
});

client.connect().catch((err) => {
  console.error("IRC connect failed:", err);
  process.exit(1);
});
