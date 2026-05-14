export const runtime = "nodejs";

import { Auth } from "@auth/core";
import { NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { applyNextAuthEnvDefaults } from "@/lib/next-auth-set-env-defaults";

function rewriteOrigin(req: NextRequest, newOrigin: string): NextRequest {
  try {
    return new NextRequest(req.nextUrl.href.replace(req.nextUrl.origin, newOrigin), req);
  } catch {
    return req;
  }
}

/**
 * When `AUTH_URL` / `NEXTAUTH_URL` is set (e.g. production canonical URL in a shared `.env`),
 * NextAuth normally rewrites every auth request to that origin. That breaks OAuth on ngrok or
 * Vercel preview URLs. Set `AUTH_PUBLIC_URL_MODE=dynamic` to keep the browser's actual host for
 * sign-in and callbacks while still using `AUTH_URL` for server actions that need it elsewhere.
 *
 * In dynamic mode we prefer `X-Forwarded-Host` + `X-Forwarded-Proto`: `NextRequest.url` honors
 * x-forwarded-proto but takes the host from the `Host` header — and reverse proxies like ngrok
 * rewrite `Host` to the upstream (localhost:3000), yielding a bogus `https://localhost:3000`
 * redirect_uri that Twitch rejects.
 */
function pickRequestForAuth(req: NextRequest): NextRequest {
  if (process.env.AUTH_PUBLIC_URL_MODE === "dynamic") {
    const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (!fwdHost) return req;
    const fwdProto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
      req.nextUrl.protocol.replace(":", "");
    return rewriteOrigin(req, `${fwdProto}://${fwdHost}`);
  }
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!envUrl?.trim()) return req;
  try {
    return rewriteOrigin(req, new URL(envUrl).origin);
  } catch {
    return req;
  }
}

async function handleAuth(req: NextRequest) {
  const config = { ...authConfig };
  applyNextAuthEnvDefaults(config);
  return Auth(pickRequestForAuth(req), config);
}

export async function GET(req: NextRequest) {
  return handleAuth(req);
}

export async function POST(req: NextRequest) {
  return handleAuth(req);
}
