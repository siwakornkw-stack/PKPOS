# Deploy to Vercel (production SaaS)

Resto POS runs on Vercel as a single Next.js app. The platform (you) collects
monthly subscription fees from restaurant tenants via your own Omise account.

## 1. Prerequisites

- The repo pushed to GitHub (or GitLab/Bitbucket).
- A [Vercel](https://vercel.com) account.
- A PostgreSQL database (see step 2).
- An [Omise/Opn](https://dashboard.omise.co) account for collecting subscriptions
  (use test keys `pkey_test_` / `skey_test_` first, switch to live keys to go live).

## 2. Database (PostgreSQL)

Vercel Functions are stateless, so the database must be external. Easiest path:
Vercel Dashboard -> Storage -> **Marketplace** -> add **Neon** (or Supabase) Postgres.
It injects a `DATABASE_URL` automatically. Or use any managed Postgres and set
`DATABASE_URL` yourself.

Pooling: serverless opens many short connections. Use the provider's **pooled**
connection string (Neon "pooled", Supabase "transaction" pooler on port 6543) for
`DATABASE_URL`. Migrations run at build time against the same URL.

## 3. Environment variables

Set these in Vercel -> Project -> Settings -> Environment Variables (Production):

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | pooled Postgres URL |
| `JWT_SECRET` | yes | >= 24 random chars. `openssl rand -base64 32` |
| `PLATFORM_OMISE_SECRET_KEY` | for real billing | `skey_live_...` (server-side charges) |
| `PLATFORM_OMISE_PUBLIC_KEY` | for real billing | `pkey_live_...` (sent to browser for tokenization) |
| `CRON_SECRET` | yes | `openssl rand -hex 32`. Vercel sends it as `Authorization: Bearer` to the renew cron |
| `TZ` | yes | `Asia/Bangkok` (or the shop's zone). Drives doc-number monthly periods + report day/hour buckets. Vercel defaults to UTC, which mis-dates post-midnight sales |
| `SEED_DEMO` | recommended | set `false` so any seed creates master data only (no demo sales) |

Without the `PLATFORM_OMISE_*` keys the app still runs, but subscription charges
fall back to **mock mode** (no money moves) - fine for a staging deploy.

## 4. Build & migrations

`vercel.json` already sets:

```json
{
  "buildCommand": "prisma generate && prisma migrate deploy && next build",
  "crons": [{ "path": "/api/cron/renew", "schedule": "0 3 * * *" }]
}
```

- `prisma generate` - builds the client (binaryTargets includes `rhel-openssl-3.0.x` for Vercel's runtime).
- `prisma migrate deploy` - applies `prisma/migrations/*` to the production DB on every deploy.
- The cron triggers daily at 03:00 UTC to auto-charge due subscriptions.

> Hobby plan allows daily crons only; Pro allows finer schedules. Daily is enough here.

## 5. First deploy

1. Vercel -> **Add New -> Project** -> import the repo.
2. Framework preset: **Next.js** (auto-detected). Leave build command as-is (vercel.json wins).
3. Add the env vars from step 3, then **Deploy**.
4. After the first deploy, create the platform super-admin + role/plan master data.
   Run the seed once against the production `DATABASE_URL` (from your machine):

   ```bash
   DATABASE_URL="<prod-pooled-url>" SEED_DEMO=false npm run db:seed:fresh
   ```

   This seeds roles + a `superadmin` login (PIN `1234` - **change it immediately**
   in Settings) and no demo tenant. Restaurants then self-register at `/signup`.

## 6. Custom domain + DNS

1. Vercel -> Project -> **Settings -> Domains** -> add `app.yourdomain.com` (or apex).
2. Vercel shows the DNS records to add at your registrar:
   - Subdomain -> `CNAME` to `cname.vercel-dns.com`.
   - Apex/root -> `A` record to Vercel's IP (shown in the dashboard), or use the
     registrar's ALIAS/ANAME to the CNAME target.
3. SSL (Let's Encrypt) is provisioned automatically once DNS resolves.

## 7. Omise (go-live)

1. Omise Dashboard -> **Keys**: copy live `pkey_live_` + `skey_live_`, set them as
   `PLATFORM_OMISE_PUBLIC_KEY` / `PLATFORM_OMISE_SECRET_KEY` in Vercel, redeploy.
2. Omise Dashboard -> **Webhooks**: add endpoint
   `https://app.yourdomain.com/api/webhooks/omise`. The app re-fetches each charge by
   id to verify (events are unsigned), so no shared secret is needed there.
3. Test with a real card on the smallest plan, confirm the charge in the Omise
   dashboard and an Invoice row in `/billing`, then refund it.

## 8. Go-live checklist

- [ ] `JWT_SECRET` is a fresh random value (not the dev default).
- [ ] `superadmin` PIN changed from `1234`.
- [ ] `CRON_SECRET` set; confirm the daily cron run in Vercel -> Deployments -> Cron logs.
- [ ] Live Omise keys set; a real charge + refund verified end-to-end.
- [ ] `SEED_DEMO=false` (no demo sales in the production DB).
- [ ] Webhook endpoint registered in Omise.
- [ ] Custom domain resolves over HTTPS.
- [ ] A test restaurant can `/signup`, use the 14-day trial, then subscribe.

## Notes

- **Receipt/kitchen printing** is on the restaurant's LAN, unreachable from the cloud.
  In production `/api/print` returns the ESC/POS buffer (base64) for a small on-site
  bridge to relay to the printer over TCP 9100. This is by design and host-independent.
- **Auto-renew**: the cron charges each tenant's saved Omise customer on the due date.
  On failure it starts a 3-day dunning grace, then suspends the tenant (which redirects
  them to `/billing` to update the card).
