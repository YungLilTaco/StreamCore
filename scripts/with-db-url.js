import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function getDatabaseUrl() {
  const prefix = "DATABASE_URL=";
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const line = txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith(prefix));

  if (!line) throw new Error("DATABASE_URL missing in .env.local");

  let url = line.slice(prefix.length).trim();
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1);
  }
  if (!url) throw new Error("DATABASE_URL empty in .env.local");
  return url;
}

const baseUrl = getDatabaseUrl();
const argv = process.argv.slice(2);

let schema = "";
const schemaFlagIdx = argv.indexOf("--schema");
if (schemaFlagIdx !== -1) {
  schema = argv[schemaFlagIdx + 1] ?? "";
  argv.splice(schemaFlagIdx, 2);
}

function withSchema(url, schemaName) {
  if (!schemaName) return url;
  const u = new URL(url);
  u.searchParams.set("schema", schemaName);
  return u.toString();
}

const url = withSchema(baseUrl, schema);
const command = argv.join(" ");
if (!command) throw new Error("Usage: node scripts/with-db-url.js <command...>");

execSync(command, {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: url
  }
});

