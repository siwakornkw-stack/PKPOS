import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { platformConfigured } from "@/lib/payments/subscription";
import { retrieveCharge } from "@/lib/payments/omise";
import { rateLimit, clientIp } from "@/lib/ratelimit";

// Omise webhook. Events are NOT signed, so we never trust the body: we re-fetch the
// charge by id via the API (secret key) and act on the verified status. Safety net
// for async/out-of-band charge outcomes; cron + billing handle the happy path.
export async function POST(req: NextRequest) {
  // each accepted event triggers an Omise API round-trip (re-fetch the charge), so throttle per
  // IP to stop an unauthenticated flood of bogus charge ids from amplifying into outbound calls.
  if (!rateLimit(`omise-webhook:${clientIp(req.headers)}`, 60, 60_000))
    return new Response("rate limited", { status: 429 });
  const event = await req.json().catch(() => null);
  const chargeId: string | undefined = event?.data?.id;
  const key: string | undefined = event?.key;
  if (!chargeId || !key?.startsWith("charge.")) return Response.json({ ignored: true });
  if (!platformConfigured()) return Response.json({ ignored: true });

  let charge;
  try {
    charge = await retrieveCharge(process.env.PLATFORM_OMISE_SECRET_KEY!, chargeId);
  } catch {
    return new Response("cannot verify", { status: 400 });
  }

  const tenantId = Number(charge.metadata?.tenantId);
  if (!tenantId) return Response.json({ ignored: true }); // not a subscription charge

  // failed subscription charge -> start the dunning clock so cron suspends after grace.
  // Guard with currentPeriodEnd <= now so a delayed/replayed webhook for a SUPERSEDED
  // charge cannot stamp a tenant who has already paid (period now in the future).
  if (charge.status === "failed") {
    const now = new Date();
    await prisma.tenant.updateMany({
      where: { id: tenantId, status: "ACTIVE", renewalFailedAt: null, currentPeriodEnd: { lte: now } },
      data: { renewalFailedAt: now },
    });
  }
  return Response.json({ ok: true });
}
