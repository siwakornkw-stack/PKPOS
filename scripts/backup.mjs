// Postgres DB backup via pg_dump. Writes to backups/. Usage: npm run backup
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const m = readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
    return m?.[1];
  } catch {
    return undefined;
  }
}

const url = dbUrl();
if (!url) { console.error("DATABASE_URL not found (.env or env)"); process.exit(1); }
if (!url.startsWith("postgres")) { console.error("Expected a PostgreSQL DATABASE_URL: " + url); process.exit(1); }
if (!existsSync("backups")) mkdirSync("backups");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = path.join("backups", `pg-${stamp}.sql`);
execSync(`pg_dump "${url}" > "${dest}"`, { stdio: "inherit", shell: true });
console.log("Postgres backup -> " + dest);
