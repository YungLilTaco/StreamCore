"use client";

import * as React from "react";

/** Twitch login for the account used to sign in to StreamCore (not the profile-menu selection). */
export function useSessionBroadcasterLogin(): { login: string | null; ready: boolean } {
  const [login, setLogin] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void fetch("/api/twitch/session-broadcaster", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { login?: string }) : null))
      .then((json) => {
        if (cancelled) return;
        const value = json?.login?.trim().toLowerCase();
        setLogin(value || null);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setLogin(null);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { login, ready };
}
