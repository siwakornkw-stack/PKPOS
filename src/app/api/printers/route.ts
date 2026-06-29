import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { isBlockedHost } from "@/lib/escpos";

export async function GET() {
  const auth = await requireBranch(PERMISSIONS.SETTINGS_MANAGE);
  if (auth instanceof Response) return auth;
  const printers = await prisma.printer.findMany({ where: { branchId: auth.branchId }, orderBy: { id: "asc" } });
  return Response.json({ printers });
}

const schema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(9100),
  type: z.enum(["RECEIPT", "KITCHEN"]),
  station: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.SETTINGS_MANAGE);
  if (auth instanceof Response) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลเครื่องพิมพ์ไม่ถูกต้อง");
  if (isBlockedHost(parsed.data.host)) return apiError(400, "host ไม่อนุญาต (loopback/link-local)");

  const printer = await prisma.printer.create({
    data: { ...parsed.data, station: parsed.data.station || null, branchId: auth.branchId },
  });
  await writeAudit({ userId: auth.user.id, action: "create_printer", entity: "printer", entityId: printer.id });
  return Response.json({ printer });
}
