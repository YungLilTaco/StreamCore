/**
 * Twitch embed iframes require one or more `parent=` query params (hostname only).
 * Prefer `NEXT_PUBLIC_SITE_URL` in production so OBS / alternate hosts still validate.
 */
export function twitchEmbedParentHostnames(): string[] {
  const hosts = new Set<string>();
  hosts.add("localhost");

  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
      if (u.hostname) hosts.add(u.hostname);
    } catch {
      /* ignore */
    }
  }

  if (typeof window !== "undefined" && window.location?.hostname) {
    hosts.add(window.location.hostname);
  }

  return [...hosts];
}

export function twitchParentQueryString(): string {
  return twitchEmbedParentHostnames()
    .map((p) => `parent=${encodeURIComponent(p)}`)
    .join("&");
}
