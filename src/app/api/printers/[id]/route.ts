import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { sendToPrinter, isBlockedHost } from "@/lib/escpos";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().positive().optional(),
  type: z.enum(["RECEIPT", "KITCHEN"]).optional(),
  station: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  test: z.boolean().optional(), // fire a test print
});

async function own(id: number, branchId: number) {
  const p = await prisma.printer.findUnique({ where: { id } });
  return p && p.branchId === branchId ? p : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.SETTINGS_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);
  const printer = await own(id, auth.branchId);
  if (!printer) return apiError(404, "ไม่พบเครื่องพิมพ์");

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");
  // same SSRF guard as create: never let a printer point at loopback/link-local (cloud metadata)
  if (parsed.data.host && isBlockedHost(parsed.data.host)) return apiError(400, "host ไม่อนุญาต (loopback/link-local)");

  // test print: send a short ESC/POS ticket to verify connectivity
  if (parsed.data.test) {
    const buf = Buffer.from(
      "\x1b\x40\x1b\x61\x01*** TEST PRINT ***\n" + printer.name + "\n\x1d\x56\x00",
      "binary"
    );
    try {
      await sendToPrinter(printer.host, printer.port, buf);
      return Response.json({ ok: true, tested: true });
    } catch (e) {
      return apiError(502, "ทดสอบพิมพ์ไม่สำเร็จ: " + (e instanceof Error ? e.message : "error"));
    }
  }

  const { test, ...data } = parsed.data;
  void test;
  const updated = await prisma.printer.update({ where: { id }, data });
  await writeAudit({ userId: auth.user.id, action: "update_printer", entity: "printer", entityId: id });
  return Response.json({ printer: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.SETTINGS_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);
  if (!(await own(id, auth.branchId))) return apiError(404, "ไม่พบเครื่องพิมพ์");

  await prisma.printer.delete({ where: { id } });
  await writeAudit({ userId: auth.user.id, action: "delete_printer", entity: "printer", entityId: id });
  return Response.json({ ok: true });
}
