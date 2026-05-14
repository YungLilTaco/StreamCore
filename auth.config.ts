import type { NextAuthConfig } from "next-auth";
import Twitch from "next-auth/providers/twitch";
import Spotify from "next-auth/providers/spotify";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const twitchScopes = [
  "openid",
  "user:read:email",
  "chat:read",
  "chat:edit",
  "channel:manage:broadcast",
  "moderator:read:followers",
  "channel:read:subscriptions",
  "bits:read",
  "channel:read:redemptions",
  "channel:manage:redemptions",
  "moderator:manage:shoutouts",
  "channel:read:polls",
  "channel:read:predictions",
  "channel:read:hype_train",
  "channel:read:goals",
  "moderator:manage:banned_users",
  "moderator:manage:warnings"
].join(" ");

/**
 * Spotify scopes required by the Spotify Bridge dock + Now Playing OBS overlay.
 *
 *   - user-read-email                → profile email (matches Spotify provider default)
 *   - user-read-currently-playing    → /me/player/currently-playing (track + art)
 *   - user-read-playback-state       → /me/player and /me/player/devices (volume, current device,
 *                                       is_playing). Needed for the 403 device-check before any
 *                                       volume / transport command.
 *   - user-modify-playback-state     → /me/player/play, /pause, /next, /previous, /volume
 *   - user-library-read              → /me/tracks/contains (whether the heart should render filled)
 *   - user-library-modify            → PUT/DELETE /me/tracks (heart / unheart the current track)
 *
 * Users who linked Spotify before the library scopes existed will only get a 401 from the
 * library endpoints; the Bridge dock handles that with an "Reconnect Spotify" hint instead of
 * a hard error.
 *
 * Spotify built-in provider uses `authorization` as a URL string. Auth.js merges our
 * `authorization: { params: { scope } }` into that string by replacing it with `{ params }` only,
 * which makes `normalizeEndpoint` fall back to `authjs.dev` and then `new URL(provider.issuer)`
 * with no issuer → `TypeError: Invalid URL`. Always set an explicit authorize URL when passing
 * `params` (see @auth/core `lib/utils/merge.js` + `lib/utils/providers.js`).
 */
const spotifyAuthorizeUrl = "https://accounts.spotify.com/authorize";

const spotifyScopes = [
  "user-read-email",
  "user-read-currently-playing",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-library-read",
  "user-library-modify"
].join(" ");

/** Auth.js `setEnvDefaults` passes these when using a provider factory (see `AUTH_SPOTIFY_*`). */
type AuthProviderEnvInject = {
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  apiKey?: string;
};

function resolveSpotifyClientCredentials(injected: AuthProviderEnvInject = {}) {
  const clientId =
    injected.clientId?.trim() ||
    process.env.SPOTIFY_CLIENT_ID?.trim() ||
    process.env.AUTH_SPOTIFY_ID?.trim() ||
    "";
  const clientSecret =
    injected.clientSecret?.trim() ||
    process.env.SPOTIFY_CLIENT_SECRET?.trim() ||
    process.env.AUTH_SPOTIFY_SECRET?.trim() ||
    "";
  return {
    clientId: clientId || "MISSING_SPOTIFY_CLIENT_ID",
    clientSecret: clientSecret || "MISSING_SPOTIFY_CLIENT_SECRET"
  };
}

/**
 * Factory so Auth.js can inject `AUTH_SPOTIFY_*` on each request and env is re-read after `.env`
 * changes without a stale module snapshot. Also avoids `""` from `.env` (would become
 * `client_id=undefined` in the authorize URL).
 */
function spotifyProvider(injected: AuthProviderEnvInject = {}) {
  const { clientId, clientSecret } = resolveSpotifyClientCredentials(injected);
  return Spotify({
    clientId,
    clientSecret,
    /** Spotify documents form POST for the token exchange; avoids "client_id: Not present" edge cases. */
    client: { token_endpoint_auth_method: "client_secret_post" },
    authorization: {
      url: spotifyAuthorizeUrl,
      params: { scope: spotifyScopes }
    }
  });
}

const publicAuthOrigin = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "").trim();
const sessionCookieSecure =
  process.env.NODE_ENV === "production" || publicAuthOrigin.startsWith("https://");

/**
 * Shared Auth.js configuration. Route handlers may call `Auth(request, authConfig)` with a
 * request whose origin matches the browser (see `AUTH_PUBLIC_URL_MODE=dynamic` in `.env.example`)
 * so OAuth callbacks work on ngrok and preview hosts even when `AUTH_URL` is set for production.
 */
export const authConfig = {
  adapter: PrismaAdapter(prisma),
  debug: process.env.AUTH_DEBUG === "true",
  trustHost: true,
  session: { strategy: "database" },
  pages: { signIn: "/login", error: "/login" },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: sessionCookieSecure
      }
    }
  },
  providers: [
    Twitch({
      clientId: process.env.TWITCH_CLIENT_ID ?? "MISSING_TWITCH_CLIENT_ID",
      clientSecret: process.env.TWITCH_CLIENT_SECRET ?? "MISSING_TWITCH_CLIENT_SECRET",
      /** Twitch accepts POST-body client auth; keeps token exchange stable behind strict proxies. */
      client: { token_endpoint_auth_method: "client_secret_post" },
      authorization: { params: { scope: twitchScopes } }
    }),
    /** Use a factory so `setEnvDefaults` can merge `AUTH_SPOTIFY_ID` / `AUTH_SPOTIFY_SECRET`. */
    spotifyProvider
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account || !user?.id) return true;
      if (account.provider !== "twitch" && account.provider !== "spotify") return true;
      if (!account.providerAccountId || !account.access_token) return true;

      try {
        const updated = await prisma.account.updateMany({
          where: {
            userId: user.id,
            provider: account.provider,
            providerAccountId: account.providerAccountId
          },
          data: {
            access_token: account.access_token,
            refresh_token: account.refresh_token ?? undefined,
            expires_at: account.expires_at ?? undefined,
            scope: account.scope ?? undefined,
            token_type: account.token_type ?? undefined,
            id_token: account.id_token ?? undefined,
            session_state:
              typeof account.session_state === "string" ? account.session_state : undefined
          }
        });
        if (updated.count > 0) {
          try {
            await prisma.userConsent.create({
              data: {
                userId: user.id,
                provider: account.provider,
                scopes: account.scope ?? ""
              }
            });
          } catch {
            /* consent log is best-effort */
          }
        }
      } catch (e) {
        console.error("[auth] signIn token mirror failed:", e);
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    }
  },
  events: {
    async linkAccount({ user, account }) {
      if (!user?.id) return;
      try {
        await prisma.userConsent.create({
          data: {
            userId: user.id,
            provider: account.provider,
            scopes: account.scope ?? ""
          }
        });
      } catch (e) {
        console.error("[auth] userConsent logging failed:", e);
      }
    }
  }
} satisfies NextAuthConfig;
