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

  const authSecretLen = process.env.AUTH_SECRET?.trim().length ?? 0;
  const nextAuthSecretLen = process.env.NEXTAUTH_SECRET?.trim().length ?? 0;
  const secretOk = authSecretLen > 0 || nextAuthSecretLen > 0;
  const twitchIdOk = Boolean(process.env.TWITCH_CLIENT_ID?.trim());
  const twitchSecretOk = Boolean(process.env.TWITCH_CLIENT_SECRET?.trim());

  let databaseOk = false;
  let databaseError: string | undefined;
  let databaseCode: string | undefined;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseOk = true;
  } catch (e) {
    databaseOk = false;
    databaseError =
      e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
    databaseCode =
      typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string"
        ? (e as { code: string }).code
        : undefined;
  }

  const origin = (
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    ""
  ).replace(/\/$/, "");

  return NextResponse.json({
    nodeEnv: process.env.NODE_ENV,
    checks: {
      /** Length > 0 characters (we only expose counts, not values). Catches wrong env name or an “empty” paste on Vercel. */
      authSecretNonEmpty: authSecretLen > 0,
      nextAuthSecretNonEmpty: nextAuthSecretLen > 0,
      anyAuthSecretReady: secretOk,
      twitchClientIdSet: twitchIdOk,
      twitchClientSecretSet: twitchSecretOk,
      databaseReachable: databaseOk,
      authPublicUrlSet: Boolean(origin)
    },
    lengths: {
      AUTH_SECRET_chars: authSecretLen,
      NEXTAUTH_SECRET_chars: nextAuthSecretLen
    },
    database:
      databaseOk
        ? { ok: true }
        : {
            ok: false,
            /** Postgres / driver code when available (e.g. P1001). */
            code: databaseCode,
            /** Truncated message — use to fix DATABASE_URL on Vercel (no secrets here). */
            message: databaseError
          },
    twitchRedirectMustInclude:
      `${origin || "https://YOUR-VERCEL-HOST.example"}/api/auth/callback/twitch`,
    twitchConsole: "https://dev.twitch.tv/console/apps",
    nextSteps: databaseOk
      ? "DB is reachable. If Twitch still fails, match Redirect URL to twitchRedirectMustInclude and check Function logs."
      : "databaseReachable is false — OAuth will show Configuration after Twitch because sessions are stored in Postgres. Fix DATABASE_URL in Vercel (Supabase: pooler :6543 + pgbouncer=true + sslmode=require). See `database.message` above. Redeploy after editing."
  });
}
