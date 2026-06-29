# Resto POS - Production Runbook

## 1. Deploy (PostgreSQL + Docker)

```bash
# 1. switch Prisma datasource to postgresql
npm run db:use-postgres

# 2. configure env (copy .env.example -> .env)
#    DATABASE_URL="postgresql://user:pass@host:5432/resto_pos?schema=public"
#    JWT_SECRET=$(openssl rand -base64 32)        # required, >= 24 chars
#    SEED_DEMO="false"                            # real store: master data only

# 3. bring up app + db
docker compose up -d --build

# health check
curl -fsS http://localhost:3000/api/health        # -> {"ok":true,"db":"up"}
```

First run applies schema + seeds master data (see docker-compose `command`). For a
real store, seed without demo sales: `npm run db:seed:fresh`.

Put the app behind HTTPS (nginx/Caddy/Cloud LB). Security headers ship from
`next.config.js`; HSTS assumes TLS termination in front.

## 2. Backup & restore

```bash
npm run backup                       # -> backups/<engine>-<timestamp>
npm run restore -- backups/<file>    # restore a specific backup
```

Schedule `npm run backup` via cron (e.g. every 15 min) and copy `backups/` to
offsite/object storage. Test a restore monthly.

## 3. Monitoring

- Liveness/readiness: `GET /api/health` (503 when DB is down) - wire to the LB + uptime monitor.
- Audit trail: Settings -> Audit Log (every login/void/refund/payment/role change).
- Low-stock + events surface in the in-app notification bell.

## 4. Incident response

1. Declare incident, note start time.
2. If data issue: stop writes, restore latest good backup (section 2), verify with `/api/health` + spot-check recent orders.
3. If app down: `docker compose logs app`, redeploy previous image, re-open service after smoke check.
4. Communicate status to branches. Log the incident + root cause in the audit notes.

Recovery targets: RPO 15 min (backup cadence), RTO 2 hours.

## 5. Go-live checklist (per design)

- [ ] Postgres provisioned, `DATABASE_URL` + strong `JWT_SECRET` set, `SEED_DEMO=false`
- [ ] HTTPS / domain / SSL ready
- [ ] `npm test` + `node scripts/smoke.mjs` green against staging
- [ ] Backup + restore tested
- [ ] Monitoring + alerting on `/api/health`
- [ ] Roles/permissions verified; demo users removed or PINs changed
- [ ] Printer (ESC/POS) + payment + PromptPay tested on real hardware
- [ ] Master data loaded (menu, prices, recipes, tables, opening stock)
- [ ] Pilot 1 branch, collect feedback 2-4 weeks, then roll out

## 6. Money note

Amounts are `Float` and rounded to 2 decimals at every write (`round2`), which is
exact for THB satang up to ~9e13. If an auditor mandates fixed-precision storage,
switch money columns to `Decimal @db.Decimal(14,2)` and convert at the API boundary.
