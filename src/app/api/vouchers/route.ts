import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// GET: vouchers for the branch (management list).
export async function GET() {
  const auth = await requireBranch(PERMISSIONS.PROMOTION_MANAGE);
  if (auth instanceof Response) return auth;

  const vouchers = await prisma.voucher.findMany({
    where: { branchId: auth.branchId },
    orderBy: { id: "desc" },
  });
  return Response.json({ vouchers });
}

const schema = z.object({
  code: z.string().min(1),
  type: z.enum(["AMOUNT", "PERCENT"]),
  value: z.number().positive(),
  minSpend: z.number().nonnegative().default(0),
});

// POST: create a single-use voucher code (management).
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.PROMOTION_MANAGE);
  if (auth instanceof Response) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลโค้ดไม่ถูกต้อง");

  const exists = await prisma.voucher.findUnique({
    where: { branchId_code: { branchId: auth.branchId, code: parsed.data.code } },
  });
  if (exists) return apiError(409, "โค้ดนี้มีอยู่แล้ว");

  const voucher = await prisma.voucher.create({
    data: { ...parsed.data, branchId: auth.branchId, used: false },
  });
  await writeAudit({ userId: auth.user.id, action: "create_voucher", entity: "voucher", entityId: voucher.id });
  return Response.json({ voucher });
}
