import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) return;
  const text = fs.readFileSync(abs, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Don’t override vars already set in the shell / CI
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const args = process.argv.slice(2);
const result = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  shell: true,
  env: process.env
});

process.exit(typeof result.status === "number" ? result.status : 1);
