import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";

// GET: branch attendance rows (most recent first) + the caller's currently-open
// clock-in (if any), so the UI can show a Clock-in vs Clock-out button.
export async function GET(req: NextRequest) {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;
  const days = Math.min(31, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 7));
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.attendance.findMany({
    where: { branchId: auth.branchId, clockIn: { gte: since } },
    include: { user: { select: { fullName: true } } },
    orderBy: { clockIn: "desc" },
  });
  const open = await prisma.attendance.findFirst({
    where: { branchId: auth.branchId, userId: auth.user.id, clockOut: null },
  });
  return Response.json({ rows, open });
}

const schema = z.object({ action: z.enum(["IN", "OUT"]), note: z.string().optional() });

// POST: clock the caller in or out (one open row per user at a time).
export async function POST(req: NextRequest) {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const open = await prisma.attendance.findFirst({
    where: { branchId: auth.branchId, userId: auth.user.id, clockOut: null },
  });

  if (parsed.data.action === "IN") {
    if (open) return apiError(409, "คุณลงเวลาเข้างานอยู่แล้ว");
    try {
      const row = await prisma.attendance.create({
        data: { branchId: auth.branchId, userId: auth.user.id, note: parsed.data.note },
      });
      await writeAudit({ userId: auth.user.id, action: "clock_in", entity: "attendance", entityId: row.id });
      return Response.json({ ok: true, attendance: row });
    } catch (e) {
      // partial unique index (one open row per branch+user) - a concurrent clock-in lost the race
      if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002")
        return apiError(409, "คุณลงเวลาเข้างานอยู่แล้ว");
      throw e;
    }
  }

  if (!open) return apiError(409, "ยังไม่ได้ลงเวลาเข้างาน");
  const row = await prisma.attendance.update({ where: { id: open.id }, data: { clockOut: new Date() } });
  await writeAudit({ userId: auth.user.id, action: "clock_out", entity: "attendance", entityId: row.id });
  return Response.json({ ok: true, attendance: row });
}
