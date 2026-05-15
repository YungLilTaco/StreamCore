/**
 * Public origin for redirects behind ngrok / reverse proxies.
 * `NextRequest.url` is often `https://localhost:3000` when forwarded-proto is https
 * but Host is still the upstream dev server — browsers then hit ERR_SSL_PROTOCOL_ERROR.
 */
export function getRequestPublicOrigin(
  headers: Headers,
  fallbackUrl?: string
): string {
  const fwdHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = headers.get("host")?.split(",")[0]?.trim();
  const host = fwdHost || hostHeader;

  if (!host) {
    if (fallbackUrl) {
      try {
        return new URL(fallbackUrl).origin;
      } catch {
        /* fall through */
      }
    }
    return "http://127.0.0.1:3000";
  }

  const fwdProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  let proto = fwdProto;
  if (!proto && fallbackUrl) {
    try {
      proto = new URL(fallbackUrl).protocol.replace(":", "");
    } catch {
      proto = "http";
    }
  }
  if (!proto) proto = "http";

  const isLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");

  if (isLocal) proto = "http";

  return `${proto}://${host}`;
}

export function publicRequestUrl(
  headers: Headers,
  pathname: string,
  fallbackUrl?: string
): URL {
  return new URL(pathname, `${getRequestPublicOrigin(headers, fallbackUrl)}/`);
}
