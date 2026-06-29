import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { DRAWER_KICK, sendToPrinter } from "@/lib/escpos";

// Open the cash drawer via the kick command on a receipt printer.
export async function POST() {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;

  const printer = await prisma.printer.findFirst({
    where: { branchId: auth.branchId, isActive: true, type: "RECEIPT" },
  });
  const host = printer?.host ?? process.env.PRINTER_HOST;
  const port = printer?.port ?? Number(process.env.PRINTER_PORT || 9100);

  if (host) {
    try {
      await sendToPrinter(host, port, DRAWER_KICK);
    } catch (e) {
      return apiError(502, "เปิดลิ้นชักไม่สำเร็จ: " + (e instanceof Error ? e.message : "error"));
    }
  }

  await writeAudit({ userId: auth.user.id, action: "open_cash_drawer" });
  return Response.json({ ok: true, base64: DRAWER_KICK.toString("base64") });
}
