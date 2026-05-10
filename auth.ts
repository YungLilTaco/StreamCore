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
  "moderator:manage:shoutouts"
].join(" ");

const spotifyScopes = [
  "user-read-currently-playing",
  "user-modify-playback-state",
  "user-read-playback-state"
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET,
  /**
   * Required for OAuth behind reverse proxies / non-Vercel hosts. If unset, remote users can hit
   * UntrustedHost or bad redirect_uri when the inferred public URL doesn’t match your domain.
   * Set AUTH_URL (or NEXTAUTH_URL) to the exact HTTPS origin visitors use (no trailing slash).
   */
  trustHost: true,
  session: { strategy: "database" },
  pages: { signIn: "/login" },
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

