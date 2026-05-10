import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Supabase Transaction pooler is port :6543 (PgBouncer). Prisma's default prepared statements
 * break there with Postgres 42P05 ("prepared statement ... already exists"). Setting
 * `pgbouncer=true` tells Prisma to disable them (official Supabase + Prisma guidance).
 */
function prismaRuntimeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return raw;
  try {
    const next = new URL(raw);
    const host = next.hostname.toLowerCase();

    // Supabase Transaction pooler (:6543) — Prisma requires pgbouncer mode (avoids prepared statement errors).
    if (next.port === "6543" && next.searchParams.get("pgbouncer") !== "true") {
      next.searchParams.set("pgbouncer", "true");
    }

    // Hosted Postgres usually expects TLS when connecting from serverless (Vercel ↔ Supabase/Neon).
    if (
      host.includes("supabase") ||
      host.includes("pooler.supabase.com") ||
      host.includes("neon.tech")
    ) {
      if (!next.searchParams.has("sslmode") && !next.searchParams.has("ssl")) {
        next.searchParams.set("sslmode", "require");
      }
    }

    return next.toString();
  } catch {
    return raw;
  }
}

const overriddenUrl = prismaRuntimeDatabaseUrl(process.env.DATABASE_URL);

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    ...(overriddenUrl !== undefined ? { datasources: { db: { url: overriddenUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

