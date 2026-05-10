"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Music2, Twitch, ShieldCheck } from "lucide-react";

type Account = { provider: string; scope: string | null; expires_at: number | null };
type Consent = { id: string; provider: string; scopes: string; grantedAt: Date };

const twitchScopes = [
  "user:read:email",
  "chat:read",
  "chat:edit",
  "channel:manage:broadcast",
  "moderator:read:followers",
  "channel:read:subscriptions",
  "bits:read",
  "channel:read:redemptions",
  "moderator:manage:shoutouts"
];

const spotifyScopes = [
  "user-read-currently-playing",
  "user-modify-playback-state",
  "user-read-playback-state"
];

export function SettingsClient({
  accounts,
  consents
}: {
  accounts: Account[];
  consents: Consent[];
}) {
  const hasTwitch = accounts.some((a) => a.provider === "twitch");
  const hasSpotify = accounts.some((a) => a.provider === "spotify");

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Twitch className="h-4 w-4 text-primary" />
              Twitch (Primary login)
            </div>
            <div className="mt-2 text-sm text-white/65">
              Required for chat features and redemption/shoutout automation.
            </div>
          </div>
          <div className="text-xs font-semibold text-white/60">{hasTwitch ? "Connected" : "Not connected"}</div>
        </div>

        <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-white/60">
            <ShieldCheck className="h-4 w-4 text-white/50" />
            Permissions requested
          </div>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {twitchScopes.map((s) => (
              <li key={s} className="font-mono text-[12px] text-white/70">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Music2 className="h-4 w-4 text-primary" />
              Spotify (Link account)
            </div>
            <div className="mt-2 text-sm text-white/65">
              Enables Now Playing overlays and playback controls.
            </div>
          </div>
          <div className="text-xs font-semibold text-white/60">{hasSpotify ? "Connected" : "Not connected"}</div>
        </div>

        <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-white/60">
            <ShieldCheck className="h-4 w-4 text-white/50" />
            Permissions requested
          </div>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {spotifyScopes.map((s) => (
              <li key={s} className="font-mono text-[12px] text-white/70">
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex gap-3">
          <Button
            variant="primary"
            className="shadow-glow-purple"
            onClick={() => signIn("spotify", { callbackUrl: "/app/settings" })}
          >
            {hasSpotify ? "Re-link Spotify" : "Link Spotify"}
          </Button>
          <Button variant="secondary" onClick={() => window.open("https://www.spotify.com/account/apps/", "_blank")}>
            Manage Spotify apps
          </Button>
        </div>
      </Card>

      <Card className="p-6 lg:col-span-2">
        <div className="text-sm font-semibold text-white">Consent log (last 10)</div>
        <p className="mt-2 text-sm text-white/65">
          Each time you connect/link a provider, StreamCore records the scopes returned by the OAuth provider.
        </p>
        <div className="mt-4 space-y-2">
          {consents.length ? (
            consents.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="text-sm text-white/80">
                  <span className="font-semibold text-white">{c.provider}</span>{" "}
                  <span className="text-white/50">•</span>{" "}
                  <span className="text-white/70">{new Date(c.grantedAt).toLocaleString()}</span>
                </div>
                <div className="max-w-full truncate font-mono text-[12px] text-white/60 md:max-w-[65%]">
                  {c.scopes || "(no scopes returned)"}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-white/60">No consent events recorded yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}

