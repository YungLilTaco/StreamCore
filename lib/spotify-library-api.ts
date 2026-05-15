/** Parse Spotify Web API error JSON from a response body string. */
export function spotifyApiErrorMessage(body: string, status: number): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string; status?: number } };
    if (j?.error?.message) return j.error.message;
  } catch {
    /* use fallback */
  }
  const trimmed = body.trim();
  if (status === 403 && (!trimmed || /forbidden/i.test(trimmed))) {
    return (
      "Spotify returned Forbidden. Liked Songs via API needs user-library-modify. " +
      "If your Spotify Developer app is still in Development Mode, Spotify may block library writes " +
      "until the app is approved — use the Open Spotify app link in Settings → Manage Spotify apps."
    );
  }
  return trimmed || `Spotify ${status}`;
}

export function spotifyTrackUri(trackId: string): string {
  return `spotify:track:${trackId}`;
}

export type SpotifyLibraryFetchResult = {
  response: Response;
  accessToken: string;
};

function spotifyAuthHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Call Spotify library endpoints with one token refresh + retry on 401.
 */
export async function spotifyLibraryFetch(
  userId: string,
  url: string,
  init: RequestInit,
  getToken: (uid: string) => Promise<{ accessToken: string }>,
  refreshToken: (uid: string) => Promise<{ accessToken: string }>
): Promise<SpotifyLibraryFetchResult> {
  const method = (init.method ?? "GET").toUpperCase();
  let accessToken = (await getToken(userId)).accessToken;

  const run = () =>
    fetch(url, {
      ...init,
      method,
      headers: {
        ...spotifyAuthHeaders(accessToken),
        ...(init.headers as Record<string, string> | undefined)
      },
      cache: "no-store"
    });

  let response = await run();

  if (response.status === 401) {
    try {
      const refreshed = await refreshToken(userId);
      accessToken = refreshed.accessToken;
      response = await run();
    } catch {
      /* return first response */
    }
  }

  return { response, accessToken };
}

type SavedTracksPage = {
  items?: { track?: { id?: string } | null }[];
};

/**
 * Whether a track is in the user's Liked Songs. Tries `/me/tracks/contains` first, then scans
 * the first pages of `/me/tracks` when contains fails (some tokens/apps return 403 on contains only).
 */
export async function spotifyTrackIsSaved(
  userId: string,
  trackId: string,
  getToken: (uid: string) => Promise<{ accessToken: string }>,
  refreshToken: (uid: string) => Promise<{ accessToken: string }>
): Promise<boolean | null> {
  const { response: containsRes } = await spotifyLibraryFetch(
    userId,
    `https://api.spotify.com/v1/me/tracks/contains?ids=${encodeURIComponent(trackId)}`,
    { method: "GET" },
    getToken,
    refreshToken
  );

  if (containsRes.ok) {
    const arr = (await containsRes.json().catch(() => null)) as boolean[] | null;
    return Boolean(arr?.[0]);
  }

  if (containsRes.status !== 403 && containsRes.status !== 404 && containsRes.status !== 400) {
    return null;
  }

  for (let offset = 0; offset < 200; offset += 50) {
    const { response: listRes } = await spotifyLibraryFetch(
      userId,
      `https://api.spotify.com/v1/me/tracks?limit=50&offset=${offset}`,
      { method: "GET" },
      getToken,
      refreshToken
    );
    if (!listRes.ok) return null;
    const body = (await listRes.json().catch(() => null)) as SavedTracksPage | null;
    const items = body?.items ?? [];
    if (items.some((row) => row?.track?.id === trackId)) return true;
    if (items.length < 50) return false;
  }

  return false;
}
