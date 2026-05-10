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
    const u = new URL(raw);
    if (u.port !== "6543") return raw;
    if (u.searchParams.get("pgbouncer") === "true") return raw;
    const next = new URL(raw);
    next.searchParams.set("pgbouncer", "true");
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

