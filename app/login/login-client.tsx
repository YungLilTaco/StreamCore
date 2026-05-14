"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Cpu, LogIn, Music2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/lib/cn";
import {
  clearOauthLinkIntent,
  readOauthLinkIntent,
  setOauthLinkIntent,
  type OauthLinkProvider
} from "@/lib/oauth-link-intent";

const authErrorMessages: Record<string, string> = {
  Configuration:
    "This code is used for several different server failures — not only missing secrets. (1) Running `npm run dev` only affects localhost; the live site reads variables from Vercel only. After changing any env var, redeploy. (2) Ensure `AUTH_SECRET`, `DATABASE_URL`, Twitch keys, and Spotify `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` are set; set `AUTH_URL` or `NEXTAUTH_URL` to your public origin. (3) Spotify: in the Spotify Developer Dashboard, add Redirect URI `https://<your-host>/api/auth/callback/spotify` using the exact host you use in the browser (`127.0.0.1` vs `localhost` must match `npm run dev`). (4) Auth.js also shows `Configuration` when the database adapter throws — check server logs during sign-in. (5) Behind ngrok while `AUTH_URL` points at production, set `AUTH_PUBLIC_URL_MODE=dynamic` in `.env.local` (see `.env.example`). (6) Temporary: `AUTH_DIAG=1` and GET `/api/debug/auth`.",
  AccessDenied: "Twitch sign-in was cancelled or refused.",
  Verification: "The sign-in link expired or was already used. Try again.",
  OAuthSignin: "Could not start Twitch sign-in (configuration or Twitch app settings).",
  OAuthCallback:
    "Twitch redirected back but the callback failed. Usually the Redirect URL in the Twitch Developer Console does not exactly match your site, or AUTH_URL / NEXTAUTH_URL is wrong.",
  OAuthCreateAccount: "Could not create your account after Twitch. Try again or contact support.",
  Callback: "OAuth callback failed. Check your Twitch app Redirect URI and your site’s public URL (AUTH_URL).",
  Default: "Sign-in failed. Try again, or ask the site owner to verify Twitch OAuth and server settings."
};

function pickAppReturn(from: string, callbackUrlHint: string | undefined, storedReturn: string | null): string {
  if (storedReturn && storedReturn.startsWith("/app")) return storedReturn;
  if (callbackUrlHint && callbackUrlHint.startsWith("/app")) return callbackUrlHint;
  if (from.startsWith("/app")) return from;
  return "/app";
}

export function LoginClient({
  from,
  callbackUrlHint,
  authError,
  errorDescription
}: {
  from: string;
  callbackUrlHint?: string;
  authError?: string;
  errorDescription?: string;
}) {
  const router = useRouter();
  const errorLine = authError ? (authErrorMessages[authError] ?? authErrorMessages.Default) : null;

  const [{ provider: oauthProvider, returnTo: oauthReturn }, setOauthIntent] = useState<{
    provider: OauthLinkProvider | null;
    returnTo: string | null;
  }>({ provider: null, returnTo: null });

  useEffect(() => {
    if (authError) {
      setOauthIntent(readOauthLinkIntent());
    } else {
      clearOauthLinkIntent();
      setOauthIntent({ provider: null, returnTo: null });
    }
  }, [authError]);

  const appReturn = useMemo(
    () => pickAppReturn(from, callbackUrlHint, oauthReturn),
    [from, callbackUrlHint, oauthReturn]
  );

  const spotifyRetry = authError && oauthProvider === "spotify";

  const handleBack = () => {
    const { returnTo } = readOauthLinkIntent();
    const target = pickAppReturn(from, callbackUrlHint, returnTo);
    router.push(target);
  };

  const startTwitch = () => {
    clearOauthLinkIntent();
    void signIn("twitch", { callbackUrl: from && from.startsWith("/") ? from : "/app" });
  };

  const startSpotify = () => {
    setOauthLinkIntent("spotify", appReturn);
    void signIn("spotify", { callbackUrl: appReturn });
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="relative sv-bg">
        <div className="pointer-events-none absolute inset-0 sv-grid opacity-[0.18]" />

        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-16">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
                <Cpu className="h-5 w-5 text-white" />
              </span>
              <div>
                <div className="text-sm font-semibold text-white">StreamCore</div>
                <div className="text-xs text-white/60">Secure sign-in</div>
              </div>
            </div>

            <div className="mt-5 text-sm text-white/70">
              {spotifyRetry ? (
                <>
                  You started <span className="text-white/90">Spotify</span> linking. Use the button below to retry
                  Spotify, or sign in with Twitch if you need to log in again first.
                </>
              ) : (
                <>
                  Sign in with Twitch to access your StreamCore dashboard. You can link Spotify after login from
                  Settings.
                </>
              )}
            </div>

            {errorLine ? (
              <div
                className={cn(
                  "mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100/95"
                )}
                role="alert"
              >
                <div className="font-semibold text-rose-200">Sign-in / account linking error</div>
                <p className="mt-1 text-rose-100/90">{errorLine}</p>
                {authError ? (
                  <p className="mt-2 font-mono text-[11px] text-rose-200/70">Code: {authError}</p>
                ) : null}
                {errorDescription ? (
                  <p className="mt-1 text-[12px] text-rose-100/80">{errorDescription}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3">
              {spotifyRetry ? (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    className="w-full border border-white/10 bg-[#1DB954] text-black shadow-none hover:bg-[#1ed760] focus-visible:ring-[#1ed760]/60"
                    onClick={startSpotify}
                  >
                    <Music2 className="h-4 w-4" />
                    Continue with Spotify
                  </Button>
                  <div className="flex gap-3">
                    <Button type="button" variant="secondary" className="flex-1" onClick={startTwitch}>
                      <LogIn className="h-4 w-4" />
                      Continue with Twitch
                    </Button>
                    <Button type="button" variant="ghost" className="shrink-0 px-3" onClick={handleBack}>
                      Back
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    className="flex-1 shadow-glow-purple"
                    onClick={startTwitch}
                  >
                    <LogIn className="h-4 w-4" />
                    Continue with Twitch
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleBack}>
                    Back
                  </Button>
                </div>
              )}
            </div>

            <details className="group mt-6 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] text-white/50">
              <summary className="cursor-pointer select-none font-medium text-white/60">
                Authorize fails? (checks for whoever runs the servers)
              </summary>
              <ol className="mt-3 list-inside list-decimal space-y-2 text-white/55">
                <li>
                  On Vercel, open the deployment&apos;s{" "}
                  <span className="text-white/70">Functions → Logs</span>, reproduce sign-in once, search for{" "}
                  <code className="font-mono text-white/65">MissingSecret</code>,{" "}
                  <code className="font-mono text-white/65">database</code>, or{" "}
                  <code className="font-mono text-white/65">[auth]</code>.
                </li>
                <li>
                  Set <code className="font-mono">AUTH_DEBUG=true</code>, redeploy, reproduce again — Auth.js prints
                  detailed steps in those logs (turn off afterward).
                </li>
                <li>
                  In dev only, GET <code className="break-all font-mono">/api/debug/auth</code> — or in prod temporarily
                  add <code className="font-mono">AUTH_DIAG=1</code>. It reports which env flags are missing and the
                  Twitch redirect URI you must register.
                </li>
                <li>
                  Spotify Developer Dashboard → your app → Redirect URIs must include{" "}
                  <code className="break-all font-mono text-white/65">{`https://<your-host>/api/auth/callback/spotify`}</code>{" "}
                  (same host as the browser: <code className="font-mono">127.0.0.1</code> vs{" "}
                  <code className="font-mono">localhost</code>).
                </li>
                <li>
                  Twitch dev console → your app → <span className="text-white/70">OAuth Redirect URLs</span> must
                  include exactly{" "}
                  <code className="break-all font-mono text-white/65">{`https://<your-live-domain>/api/auth/callback/twitch`}</code>
                  .
                </li>
              </ol>
            </details>
          </Card>
        </div>
      </div>
    </div>
  );
}
