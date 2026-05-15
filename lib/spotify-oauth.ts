/** Spotify OAuth scopes used by Auth.js and the Spotify Bridge dock. */
export const SPOTIFY_OAUTH_SCOPES = [
  "user-read-email",
  "user-read-currently-playing",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-library-read",
  "user-library-modify"
] as const;

export const SPOTIFY_OAUTH_SCOPE_STRING = SPOTIFY_OAUTH_SCOPES.join(" ");

export const SPOTIFY_LIBRARY_SCOPES = ["user-library-read", "user-library-modify"] as const;

export function spotifyScopeSet(scope: string | null | undefined): Set<string> {
  return new Set((scope ?? "").split(/[\s,]+/).filter(Boolean));
}

export function spotifyAccountHasLibraryScopes(scope: string | null | undefined): boolean {
  const granted = spotifyScopeSet(scope);
  return SPOTIFY_LIBRARY_SCOPES.every((s) => granted.has(s));
}

/** Auth.js `signIn("spotify", …)` options — forces consent so library scopes are granted on relink. */
export function spotifySignInOptions(callbackUrl: string) {
  return {
    callbackUrl,
    authorizationParams: {
      scope: SPOTIFY_OAUTH_SCOPE_STRING,
      show_dialog: "true" as const
    }
  };
}
