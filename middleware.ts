import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicRequestUrl } from "@/lib/request-public-origin";

/**
 * Edge-safe auth gate — checks only the session cookie.
 * Do NOT call `auth()` / Prisma here; Next.js middleware runs on the Edge runtime.
 */
function hasSessionCookie(req: NextRequest): boolean {
  return Boolean(
    req.cookies.get("__Secure-authjs.session-token")?.value ||
      req.cookies.get("authjs.session-token")?.value
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const loggedIn = hasSessionCookie(req);

  if (loggedIn && (pathname === "/" || pathname === "/login")) {
    return NextResponse.redirect(publicRequestUrl(req.headers, "/app/dashboard", req.url));
  }

  if (!loggedIn && pathname.startsWith("/app") && !pathname.startsWith("/app/api")) {
    const login = publicRequestUrl(req.headers, "/login", req.url);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/app/:path*"]
};
