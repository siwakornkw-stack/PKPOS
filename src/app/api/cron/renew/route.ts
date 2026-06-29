import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { chargeSubscription } from "@/lib/payments/subscription";
import { PLANS, PAID_PLANS } from "@/lib/plans";

// Daily auto-renew. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
// Charges each due tenant's saved card; on failure, dunning grace then suspend.
const GRACE_DAYS = 3;
const DAY = 86400000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // require CRON_SECRET in every environment (no unauthenticated bypass)
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b); // constant-time
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const due = await prisma.tenant.findMany({
    where: { status: "ACTIVE", plan: { in: [...PAID_PLANS] }, currentPeriodEnd: { lte: now } },
  });

  let renewed = 0, retried = 0, suspended = 0, skipped = 0;
  for (const t of due) {
    // rate-limit retries to once/day: skip a tenant already attempted within the last 24h
    // (also aligns with Omise's 24h idempotency window below).
    if (t.renewalFailedAt && now.getTime() - t.renewalFailedAt.getTime() < DAY) { skipped++; continue; }

    const price = PLANS[t.plan]?.price ?? 0;
    // key anchored to the period being renewed: a same-period retry (concurrent run,
    // partial-commit failure) reuses the same charge instead of double-billing.
    const idempotencyKey = `renew:${t.id}:${t.currentPeriodEnd?.toISOString() ?? "na"}`;
    const result = await chargeSubscription(t, t.plan, price, { idempotencyKey });

    if (result.success) {
      const base = t.currentPeriodEnd && t.currentPeriodEnd > now ? t.currentPeriodEnd : now;
      const periodEnd = new Date(base.getTime() + 30 * DAY);
      try {
        await prisma.$transaction([
          prisma.tenant.update({ where: { id: t.id }, data: { currentPeriodEnd: periodEnd, renewalFailedAt: null } }),
          prisma.invoice.create({ data: { tenantId: t.id, plan: t.plan, amount: price, status: "PAID", periodStart: now, periodEnd, omiseChargeId: result.chargeId } }),
        ]);
      } catch (e) {
        if ((e as { code?: string })?.code !== "P2002") throw e; // duplicate charge already recorded
      }
      renewed++;
    } else {
      const failedSince = t.renewalFailedAt ?? now;
      const expired = now.getTime() - failedSince.getTime() >= GRACE_DAYS * DAY;
      if (expired) {
        await prisma.$transaction([
          prisma.tenant.update({ where: { id: t.id }, data: { status: "SUSPENDED" } }),
          prisma.invoice.create({ data: { tenantId: t.id, plan: t.plan, amount: price, status: "FAILED", periodStart: now, periodEnd: now, failureMessage: result.message } }),
        ]);
        suspended++;
      } else {
        if (!t.renewalFailedAt) {
          // don't let one tenant's write error abort the whole renewal batch
          try { await prisma.tenant.update({ where: { id: t.id }, data: { renewalFailedAt: now } }); }
          catch (e) { console.error("renewalFailedAt update failed", t.id, e); }
        }
        retried++;
      }
    }
  }

  return Response.json({ ok: true, processed: due.length, renewed, retried, suspended, skipped });
}
