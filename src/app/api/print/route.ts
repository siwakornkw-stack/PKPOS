import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { buildReceiptBuffer, buildKitchenTicketBuffer, buildPreBillBuffer, sendToPrinter } from "@/lib/escpos";

const schema = z.object({
  orderId: z.number().int().positive(),
  target: z.enum(["receipt", "kitchen", "prebill"]),
});

export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลการพิมพ์ไม่ถูกต้อง");
  const { orderId, target } = parsed.data;

  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    include: {
      items: {
        where: { status: { not: "VOID" } },
        orderBy: { createdAt: "asc" },
        include: { menuItem: { select: { category: { select: { station: true } } } } },
      },
      payments: { orderBy: { createdAt: "asc" } },
      table: true,
      branch: true,
    },
  });
  if (!order || order.branchId !== branchId) return apiError(404, "ไม่พบออเดอร์");

  // attach each line's kitchen station so tickets can be routed per station
  const orderForPrint = { ...order, items: order.items.map((i) => ({ ...i, station: i.menuItem?.category?.station ?? null })) };
  const fallbackBuffer =
    target === "kitchen" ? buildKitchenTicketBuffer(orderForPrint)
    : target === "prebill" ? buildPreBillBuffer(orderForPrint)
    : buildReceiptBuffer(orderForPrint);

  // Printers configured in the app (Settings -> เครื่องพิมพ์). If none, fall back
  // to the PRINTER_HOST env, else just return the buffer (works without hardware).
  const printers = await prisma.printer.findMany({
    where: { branchId, isActive: true, type: target === "kitchen" ? "KITCHEN" : "RECEIPT" },
  });

  // Each printer gets its own buffer: a station-scoped kitchen printer prints only its
  // station's items (null station = full ticket); receipt printers all get the receipt.
  let targets: { host: string; port: number; name: string; buffer: Buffer }[];
  if (printers.length) {
    // items whose station is served by no station printer (null/typo/new) must still print
    // somewhere: a null-station printer prints the full ticket, else attach them to the first
    // station printer so the kitchen never silently loses items.
    const served = new Set(printers.filter((p) => p.station).map((p) => p.station));
    const orphans = orderForPrint.items.filter((i) => !i.station || !served.has(i.station));
    let orphansPlaced = printers.some((p) => !p.station); // a full-ticket printer already covers them
    targets = printers.flatMap((p) => {
      if (target !== "kitchen" || !p.station)
        return [{ host: p.host, port: p.port, name: p.name, buffer: fallbackBuffer }];
      let its = orderForPrint.items.filter((i) => i.station === p.station);
      if (!orphansPlaced && orphans.length) { its = its.concat(orphans); orphansPlaced = true; }
      if (its.length === 0) return [];
      return [{ host: p.host, port: p.port, name: p.name, buffer: buildKitchenTicketBuffer(orderForPrint, its) }];
    });
  } else if (process.env.PRINTER_HOST) {
    targets = [{ host: process.env.PRINTER_HOST, port: Number(process.env.PRINTER_PORT || 9100), name: "env", buffer: fallbackBuffer }];
  } else {
    targets = [];
  }

  let printed = 0;
  const agentMode = order.branch.printMode === "agent";
  if (agentMode) {
    // cloud server can't reach a LAN printer directly: queue jobs for the on-site print-agent
    if (targets.length)
      await prisma.printJob.createMany({
        data: targets.map((t) => ({ branchId, kind: target.toUpperCase(), host: t.host, port: t.port, payload: t.buffer.toString("base64") })),
      });
    printed = targets.length;
  } else {
    const errors: string[] = [];
    for (const t of targets) {
      try { await sendToPrinter(t.host, t.port, t.buffer); printed++; }
      catch (e) { errors.push(`${t.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (targets.length > 0 && printed === 0)
      return apiError(502, "พิมพ์ไม่สำเร็จ: " + errors.join("; "));
  }

  await writeAudit({
    userId: user.id, action: "print", entity: "sales_order", entityId: orderId,
    after: { target, docNo: order.docNo, printed, queued: agentMode },
  });

  return Response.json({ ok: true, printed, queued: agentMode, bytes: fallbackBuffer.length, base64: fallbackBuffer.toString("base64") });
}
