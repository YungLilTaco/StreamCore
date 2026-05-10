import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * One-off troubleshooting: verifies env presence + DB (no secrets returned).
 *
 * - Local dev: always available GET /api/debug/auth
 * - Production: set AUTH_DIAG=1 temporarily, redeploy, then remove
 */
export async function GET() {
  const enabled =
    process.env.NODE_ENV !== "production" || process.env.AUTH_DIAG === "1";
  if (!enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secretOk = Boolean(
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()
  );
  const twitchIdOk = Boolean(process.env.TWITCH_CLIENT_ID?.trim());
  const twitchSecretOk = Boolean(process.env.TWITCH_CLIENT_SECRET?.trim());

  let databaseOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  const origin = (
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    ""
  ).replace(/\/$/, "");

  return NextResponse.json({
    nodeEnv: process.env.NODE_ENV,
    checks: {
      authSecretSet: secretOk,
      twitchClientIdSet: twitchIdOk,
      twitchClientSecretSet: twitchSecretOk,
      databaseReachable: databaseOk,
      authPublicUrlSet: Boolean(origin)
    },
    twitchRedirectMustInclude:
      `${origin || "https://YOUR-VERCEL-HOST.example"}/api/auth/callback/twitch`,
    twitchConsole: "https://dev.twitch.tv/console/apps",
    nextSteps:
      "If checks look good but Twitch still fails: Twitch app → Redirect URLs must exactly match twitchRedirectMustInclude (https, correct host, includes /api/auth/callback/twitch). Optionally set AUTH_URL to that HTTPS origin."
  });
}
