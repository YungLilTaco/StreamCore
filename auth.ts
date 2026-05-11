import NextAuth from "next-auth";
import Twitch from "next-auth/providers/twitch";
import Spotify from "next-auth/providers/spotify";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const twitchScopes = [
  // Required for Auth.js Twitch provider (OIDC id_token)
  "openid",
  "user:read:email",
  "chat:read",
  "chat:edit",
  // Live dashboard: stream info (title/category/tags)
  "channel:manage:broadcast",
  // Live dashboard: realtime activity feed
  "moderator:read:followers",
  "channel:read:subscriptions",
  "bits:read",
  "channel:read:redemptions",
  "moderator:manage:shoutouts",
  "channel:read:polls",
  "channel:read:predictions",
  // EventSub: hype train + creator goals
  "channel:read:hype_train",
  "channel:read:goals",
  // User profile popover moderation: ban/timeout/unban + warnings + ban-status read
  "moderator:manage:banned_users",
  "moderator:manage:warnings"
].join(" ");

const spotifyScopes = [
  "user-read-currently-playing",
  "user-modify-playback-state",
  "user-read-playback-state"
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  /** Verbose `[auth]` server logs — set AUTH_DEBUG=true on Vercel, reproduce sign-in once, read Function logs. */
  debug: process.env.AUTH_DEBUG === "true",
  /**
   * Do not set `secret` here — let Auth.js infer `AUTH_SECRET` / `NEXTAUTH_SECRET` via `setEnvDefaults`.
   * Passing `secret: undefined` vs a computed empty value can interfere with merging on some hosts.
   */
  /**
   * Required for OAuth behind reverse proxies / non-Vercel hosts. If unset, remote users can hit
   * UntrustedHost or bad redirect_uri when the inferred public URL doesn’t match your domain.
   * Set AUTH_URL (or NEXTAUTH_URL) to the exact HTTPS origin visitors use (no trailing slash).
   */
  trustHost: true,
  session: { strategy: "database" },
  /** Show branded `/login` with details instead of the generic `/api/auth/error` page. */
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
        secure: process.env.NODE_ENV === "production"
      }
    }
  },
  providers: [
    Twitch({
      clientId: process.env.TWITCH_CLIENT_ID ?? "MISSING_TWITCH_CLIENT_ID",
      clientSecret: process.env.TWITCH_CLIENT_SECRET ?? "MISSING_TWITCH_CLIENT_SECRET",
      authorization: { params: { scope: twitchScopes } }
    }),
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID ?? "MISSING_SPOTIFY_CLIENT_ID",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "MISSING_SPOTIFY_CLIENT_SECRET",
      authorization: { params: { scope: spotifyScopes } }
    })
  ],
  callbacks: {
    /**
     * PrismaAdapter only writes tokens to `Account` on the FIRST link. On every re-auth (e.g. user
     * disconnects on twitch.tv then signs in again, or you add new scopes) Twitch issues new tokens
     * and revokes the old ones — but the adapter ignores them and our DB row keeps the revoked
     * `access_token` / `refresh_token`. Mirror the fresh OAuth tokens onto the existing row here.
     */
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
        // Never fail the OAuth callback if consent logging breaks (DB hiccup, etc.)
        console.error("[auth] userConsent logging failed:", e);
      }
    }
  }
});

export const { GET, POST } = handlers;

