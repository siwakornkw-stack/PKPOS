// Fail fast on missing/weak configuration. Imported by lib/db so every server
// path validates once. Skipped during the build phase (no runtime env yet).
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const isProd = process.env.NODE_ENV === "production";

if (!isBuild) {
  if (!process.env.DATABASE_URL) throw new Error("Missing required env: DATABASE_URL");
  if (isProd) {
    if (!process.env.JWT_SECRET) throw new Error("Missing required env: JWT_SECRET (production)");
    if ((process.env.JWT_SECRET?.length ?? 0) < 24)
      throw new Error("JWT_SECRET must be at least 24 chars in production");
    if (process.env.JWT_SECRET?.includes("dev-secret"))
      console.warn("[env] JWT_SECRET is still the dev default - set a real secret before going live");
    // SaaS billing: without these the platform collects nothing (subscriptions run in mock-approve mode).
    if (!process.env.PLATFORM_OMISE_SECRET_KEY || !process.env.PLATFORM_OMISE_PUBLIC_KEY)
      console.warn("[env] PLATFORM_OMISE_*_KEY unset - subscription billing is in MOCK mode (no real charges)");
    if (!process.env.CRON_SECRET)
      console.warn("[env] CRON_SECRET unset - the auto-renew cron endpoint is unprotected; set it (Vercel sends it as Bearer)");
    if (!process.env.DELIVERY_WEBHOOK_SECRET)
      console.warn("[env] DELIVERY_WEBHOOK_SECRET unset - the delivery webhook fails closed (rejects all) in production; set it before enabling aggregator imports");
  }
}

export {};
