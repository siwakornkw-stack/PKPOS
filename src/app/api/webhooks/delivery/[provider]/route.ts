import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, writeAudit } from "@/lib/api";
import { resolveOrderItems } from "@/lib/orders";
import { computeTotals, lineAmount } from "@/lib/totals";
import { nextDocNo, nextQueueNo } from "@/lib/docno";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { webhookSecretOk } from "@/lib/integrations";
import { isDeliveryProvider, normalizeDeliveryPayload } from "@/lib/integrations/delivery";

// POST: import a delivery-aggregator order. Public endpoint (called by Grab / LINE
// MAN / Shopee / Robinhood), protected by a shared secret + rate limit. The order
// lands as a DELIVERY order in SENT status so it flows straight to the kitchen.
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const provider = (await params).provider.toUpperCase();
  if (!isDeliveryProvider(provider)) return apiError(404, "ไม่รู้จักผู้ให้บริการ");
  if (!webhookSecretOk(req.headers)) return apiError(401, "unauthorized");
  if (!rateLimit(`delivery:${clientIp(req.headers)}`, 60, 60_000)) return apiError(429, "เรียกถี่เกินไป");

  const norm = normalizeDeliveryPayload(provider, await req.json().catch(() => null));
  if (!norm) return apiError(400, "payload ไม่ถูกต้อง");

  const branch = await prisma.branch.findUnique({ where: { code: norm.branchCode } });
  if (!branch) return apiError(404, "ไม่พบสาขา");
  // the webhook secret is global, so a payload could target any branch code. If an allowlist is
  // configured, only accept those codes (per-provider HMAC + per-branch secret is the go-live fix).
  const allow = (process.env.DELIVERY_WEBHOOK_BRANCH_CODES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length && !allow.includes(branch.code)) return apiError(403, "สาขานี้ไม่ได้เปิดรับ webhook");

  // idempotency: one aggregator order id => one of our orders (DB-unique key guards races)
  const idemKey = `${provider}:${norm.externalRef}`;
  const dup = await prisma.salesOrder.findFirst({ where: { idempotencyKey: idemKey, branchId: branch.id } });
  if (dup) return Response.json({ order: { id: dup.id, docNo: dup.docNo }, deduped: true });

  // map the aggregator's item codes to our menu
  const codes = norm.items.map((i) => i.code);
  const menuItems = await prisma.menuItem.findMany({ where: { branchId: branch.id, code: { in: codes }, isActive: true, isAvailable: true } });
  const byCode = new Map(menuItems.map((m) => [m.code, m]));
  const unknown = codes.filter((c) => !byCode.has(c));
  if (unknown.length) return apiError(422, `ไม่พบเมนู: ${unknown.join(", ")}`);

  const payloadItems = norm.items.map((i) => ({ menuItemId: byCode.get(i.code)!.id, qty: i.qty, note: i.note }));

  let resolved;
  try {
    resolved = await resolveOrderItems(prisma, branch.id, "DELIVERY", payloadItems);
  } catch {
    return apiError(422, "มีเมนูที่ไม่พบในระบบ");
  }
  const totals = computeTotals(resolved, "DELIVERY", 0, { taxRate: branch.taxRate, serviceRate: branch.serviceRate });

  // delivery orders are unattended: attribute to the branch's first active user
  const sysUser = await prisma.user.findFirst({ where: { branchId: branch.id, isActive: true }, orderBy: { id: "asc" } });
  if (!sysUser) return apiError(500, "สาขานี้ยังไม่มีผู้ใช้");

  try {
    const order = await prisma.$transaction(async (tx) => {
      const queueNo = await nextQueueNo(branch.code, tx);
      return tx.salesOrder.create({
        data: {
          docNo: await nextDocNo("SO", branch.code, tx),
          idempotencyKey: idemKey,
          branchId: branch.id,
          orderType: "DELIVERY",
          source: provider,
          externalRef: norm.externalRef,
          note: [norm.customerName, norm.note].filter(Boolean).join(" - ") || null,
          queueNo,
          userId: sysUser.id,
          status: "SENT",
          ...totals,
          items: {
            create: resolved.map((i) => ({
              menuItemId: i.menuItemId,
              name: i.name,
              qty: i.qty,
              unitPrice: i.unitPrice,
              discount: i.discount,
              lineAmount: lineAmount(i),
              status: "PENDING",
              note: i.note,
              options: { create: i.optionRows.map((o) => ({ name: o.name, priceDelta: o.priceDelta })) },
            })),
          },
        },
        include: { items: true },
      });
    });
    await writeAudit({ action: "delivery_import", entity: "sales_order", entityId: order.id, after: { provider, externalRef: norm.externalRef } });
    return Response.json({ order: { id: order.id, docNo: order.docNo, queueNo: order.queueNo } });
  } catch (e) {
    // unique violation on idempotencyKey => a concurrent import already created it
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      const existing = await prisma.salesOrder.findFirst({ where: { idempotencyKey: idemKey, branchId: branch.id } });
      return Response.json({ order: existing ? { id: existing.id, docNo: existing.docNo } : null, deduped: true });
    }
    throw e;
  }
}
