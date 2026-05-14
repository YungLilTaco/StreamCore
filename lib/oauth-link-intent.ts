"use client";

const LAST_KEY = "sv:last-oauth";
const RETURN_KEY = "sv:oauth-return";

export type OauthLinkProvider = "spotify" | "twitch";

/** Remember which provider the user started so `/login?error=…` can show the right retry CTA. */
export function setOauthLinkIntent(provider: OauthLinkProvider, returnTo: string) {
  try {
    sessionStorage.setItem(LAST_KEY, provider);
    sessionStorage.setItem(RETURN_KEY, returnTo);
  } catch {
    /* private mode / quota */
  }
}

export function readOauthLinkIntent(): {
  provider: OauthLinkProvider | null;
  returnTo: string | null;
} {
  try {
    const p = sessionStorage.getItem(LAST_KEY);
    const r = sessionStorage.getItem(RETURN_KEY);
    const provider = p === "spotify" || p === "twitch" ? p : null;
    const returnTo =
      r && r.startsWith("/") && !r.startsWith("//") && r.startsWith("/app") ? r : null;
    return { provider, returnTo };
  } catch {
    return { provider: null, returnTo: null };
  }
}

export function clearOauthLinkIntent() {
  try {
    sessionStorage.removeItem(LAST_KEY);
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* */
  }
}
