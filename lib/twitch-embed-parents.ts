/**
 * Twitch embed iframes require one or more `parent=` query params (hostname only).
 * Prefer `NEXT_PUBLIC_SITE_URL` in production so OBS / alternate hosts still validate.
 */
export function twitchEmbedParentHostnames(): string[] {
  const hosts = new Set<string>();
  hosts.add("localhost");
  hosts.add("127.0.0.1");

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

  // ngrok / preview tunnels (e.g. *.ngrok-free.dev)
  if (typeof window !== "undefined" && window.location?.hostname?.includes("ngrok")) {
    hosts.add(window.location.hostname);
  }

  return [...hosts];
}

/**
 * `parent=` query for Twitch embed CSP. **`localhost` is always first** so local dev explicitly
 * satisfies Twitch’s parent allowlist even when other hosts are present.
 */
export function twitchParentQueryString(): string {
  const hosts = twitchEmbedParentHostnames();
  const ordered = new Set<string>(["localhost", "127.0.0.1"]);
  for (const h of hosts) {
    if (h) ordered.add(h);
  }
  return [...ordered].map((p) => `parent=${encodeURIComponent(p)}`).join("&");
}
