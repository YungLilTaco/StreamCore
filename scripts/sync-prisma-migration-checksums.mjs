/**
 * After reconciling migration SQL files with your repo, Prisma stores a SHA-256 checksum of each
 * `migration.sql` in `_prisma_migrations`. If the file content no longer matches (e.g. you
 * recreated a migration that was already applied), `migrate deploy` can fail checksum validation.
 *
 * This script prints UPDATE statements so you can align the DB with the current files.
 * Review the output, then run it against your **development** database only (e.g. via Supabase SQL editor).
 *
 * Usage: node scripts/sync-prisma-migration-checksums.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const migDir = path.join(root, "prisma", "migrations");
const names = fs
  .readdirSync(migDir)
  .filter((n) => n !== "migration_lock.toml" && fs.statSync(path.join(migDir, n)).isDirectory());

console.log("-- Paste into SQL editor (dev DB). Verify migration names match your _prisma_migrations rows.\n");

for (const name of names.sort()) {
  const sqlPath = path.join(migDir, name, "migration.sql");
  if (!fs.existsSync(sqlPath)) continue;
  const buf = fs.readFileSync(sqlPath);
  const checksum = crypto.createHash("sha256").update(buf).digest("hex");
  console.log(
    `UPDATE "_prisma_migrations" SET checksum = '${checksum}' WHERE migration_name = '${name}';`
  );
}
