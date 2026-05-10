"use client";

import { useRouter } from "next/navigation";
import { Cpu, LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/lib/cn";

const authErrorMessages: Record<string, string> = {
  Configuration:
    "Server auth configuration is incomplete (check AUTH_SECRET and AUTH_URL in production).",
  AccessDenied: "Twitch sign-in was cancelled or refused.",
  Verification: "The sign-in link expired or was already used. Try again.",
  OAuthSignin: "Could not start Twitch sign-in (configuration or Twitch app settings).",
  OAuthCallback:
    "Twitch redirected back but the callback failed. Usually the Redirect URL in the Twitch Developer Console does not exactly match your site, or AUTH_URL / NEXTAUTH_URL is wrong.",
  OAuthCreateAccount: "Could not create your account after Twitch. Try again or contact support.",
  Callback: "OAuth callback failed. Check your Twitch app Redirect URI and your site’s public URL (AUTH_URL).",
  Default: "Sign-in failed. Try again, or ask the site owner to verify Twitch OAuth and server settings."
};

export function LoginClient({
  from,
  authError,
  errorDescription
}: {
  from: string;
  authError?: string;
  errorDescription?: string;
}) {
  const router = useRouter();
  const errorLine = authError ? (authErrorMessages[authError] ?? authErrorMessages.Default) : null;

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
              Sign in with Twitch to access your StreamCore dashboard. You can link Spotify after
              login from Settings.
            </div>

            {errorLine ? (
              <div
                className={cn(
                  "mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100/95"
                )}
                role="alert"
              >
                <div className="font-semibold text-rose-200">Twitch sign-in error</div>
                <p className="mt-1 text-rose-100/90">{errorLine}</p>
                {authError ? (
                  <p className="mt-2 font-mono text-[11px] text-rose-200/70">Code: {authError}</p>
                ) : null}
                {errorDescription ? (
                  <p className="mt-1 text-[12px] text-rose-100/80">{errorDescription}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex gap-3">
              <Button
                variant="primary"
                className="flex-1 shadow-glow-purple"
                onClick={async () => {
                  await signIn("twitch", { callbackUrl: from || "/app" });
                }}
              >
                <LogIn className="h-4 w-4" />
                Continue with Twitch
              </Button>
              <Button variant="secondary" onClick={() => router.push("/")}>
                Back
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

