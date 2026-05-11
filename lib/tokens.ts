import { prisma } from "@/lib/prisma";

type Provider = "twitch" | "spotify";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function refreshTwitchToken(refreshToken: string) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  });

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
  });

  if (!res.ok) throw new Error(`Twitch refresh failed: ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string[];
    token_type?: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: nowSeconds() + json.expires_in,
    scope: Array.isArray(json.scope) ? json.scope.join(" ") : undefined,
    tokenType: json.token_type
  };
}

async function refreshSpotifyToken(refreshToken: string) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET");

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store"
  });

  if (!res.ok) throw new Error(`Spotify refresh failed: ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: nowSeconds() + json.expires_in,
    scope: json.scope,
    tokenType: json.token_type
  };
}

/**
 * Returns a valid access token for the provider, performing refresh-token rotation
 * and persisting the updated tokens to the Prisma `Account` row.
 *
 * - Stores `access_token`, `refresh_token`, `expires_at`, and `scope` on Account.
 * - Refreshes when expired or within a 60s safety window.
 */
export async function getProviderAccessToken(userId: string, provider: Provider) {
  const account = await prisma.account.findFirst({
    where: { userId, provider }
  });

  if (!account?.access_token) throw new Error(`No ${provider} account linked`);

  const expiresAt = account.expires_at ?? 0;
  const needsRefresh = !expiresAt || expiresAt <= nowSeconds() + 60;

  if (!needsRefresh) {
    return { accessToken: account.access_token, expiresAt, scope: account.scope ?? null };
  }

  if (!account.refresh_token) throw new Error(`No refresh_token for ${provider} account`);

  const refreshed =
    provider === "twitch"
      ? await refreshTwitchToken(account.refresh_token)
      : await refreshSpotifyToken(account.refresh_token);

  const nextRefresh = refreshed.refreshToken ?? account.refresh_token;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: refreshed.accessToken,
      refresh_token: nextRefresh,
      expires_at: refreshed.expiresAt,
      scope: refreshed.scope ?? account.scope,
      token_type: refreshed.tokenType ?? account.token_type
    }
  });

  return {
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
    scope: (refreshed.scope ?? account.scope) ?? null
  };
}

/**
 * Force a refresh-token rotation right now and persist the result, ignoring `expires_at`.
 * Throws when the provider rejects the refresh (e.g. the user disconnected the app — they must sign in again).
 */
export async function forceRefreshProviderToken(userId: string, provider: Provider) {
  const account = await prisma.account.findFirst({ where: { userId, provider } });
  if (!account) throw new Error(`No ${provider} account linked`);
  if (!account.refresh_token) throw new Error(`No refresh_token for ${provider} account`);

  const refreshed =
    provider === "twitch"
      ? await refreshTwitchToken(account.refresh_token)
      : await refreshSpotifyToken(account.refresh_token);

  const nextRefresh = refreshed.refreshToken ?? account.refresh_token;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: refreshed.accessToken,
      refresh_token: nextRefresh,
      expires_at: refreshed.expiresAt,
      scope: refreshed.scope ?? account.scope,
      token_type: refreshed.tokenType ?? account.token_type
    }
  });

  return {
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
    scope: (refreshed.scope ?? account.scope) ?? null
  };
}

