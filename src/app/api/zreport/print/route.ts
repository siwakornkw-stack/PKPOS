import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { buildZReportBuffer, sendToPrinter, type ZReport } from "@/lib/escpos";

const schema = z.object({
  report: z.object({
    date: z.string(),
    summary: z.object({
      orderCount: z.number(), grossSales: z.number(), discount: z.number(), serviceCharge: z.number(),
      tax: z.number(), netSales: z.number(), cost: z.number(), grossProfit: z.number(),
      voidCount: z.number(), refundCount: z.number(), refundAmount: z.number(),
    }),
    byPayment: z.array(z.object({ method: z.string(), amount: z.number() })),
    byCategory: z.array(z.object({ name: z.string(), amount: z.number() })),
  }),
});

// POST: print the daily X/Z sales summary to the branch's receipt printer(s).
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.REPORT_EXPORT);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลรายงานไม่ถูกต้อง");

  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } });
  if (!branch) return apiError(500, "ไม่พบข้อมูลสาขา");
  const buffer = buildZReportBuffer(parsed.data.report as ZReport, branch.name);

  const printers = await prisma.printer.findMany({ where: { branchId, isActive: true, type: "RECEIPT" } });
  const targets = printers.length
    ? printers.map((p) => ({ host: p.host, port: p.port, name: p.name }))
    : process.env.PRINTER_HOST
      ? [{ host: process.env.PRINTER_HOST, port: Number(process.env.PRINTER_PORT || 9100), name: "env" }]
      : [];

  let printed = 0;
  const errors: string[] = [];
  for (const t of targets) {
    try { await sendToPrinter(t.host, t.port, buffer); printed++; }
    catch (e) { errors.push(`${t.name}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (targets.length > 0 && printed === 0) return apiError(502, "พิมพ์ไม่สำเร็จ: " + errors.join("; "));

  await writeAudit({ userId: user.id, action: "print_zreport", entity: "branch", entityId: branchId, after: { date: parsed.data.report.date } });
  return Response.json({ ok: true, printed, bytes: buffer.length, base64: buffer.toString("base64") });
}
