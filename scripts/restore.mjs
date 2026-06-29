// Postgres DB restore from a backup file. Usage: npm run restore -- backups/<file>
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const m = readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
    return m?.[1];
  } catch {
    return undefined;
  }
}

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("Usage: npm run restore -- backups/<file>");
  process.exit(1);
}
const url = dbUrl();
if (!url) { console.error("DATABASE_URL not found"); process.exit(1); }
if (!url.startsWith("postgres")) { console.error("Expected a PostgreSQL DATABASE_URL"); process.exit(1); }

execSync(`psql "${url}" < "${file}"`, { stdio: "inherit", shell: true });
console.log(`Postgres restored from ${file}`);
