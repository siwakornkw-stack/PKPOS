import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { round2 } from "@/lib/format";

const schema = z.object({
  type: z.enum(["PAID_IN", "PAID_OUT"]),
  amount: z.number().positive(),
  reason: z.string().max(200).optional(),
});

// POST: record a non-sale cash drawer movement (petty cash in/out) on the open shift.
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const shift = await prisma.shift.findFirst({
    where: { branchId: auth.branchId, userId: auth.user.id, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
  if (!shift) return apiError(409, "ยังไม่ได้เปิดกะ");

  const m = await prisma.cashMovement.create({
    data: {
      branchId: auth.branchId,
      shiftId: shift.id,
      type: parsed.data.type,
      amount: round2(parsed.data.amount),
      reason: parsed.data.reason,
      createdBy: auth.user.id,
    },
  });
  await writeAudit({ userId: auth.user.id, action: "cash_movement", entity: "shift", entityId: shift.id, after: { type: m.type, amount: m.amount } });
  return Response.json({ ok: true, id: m.id });
}
