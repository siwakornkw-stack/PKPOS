import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});

// PDPA right of access: export everything held about a member.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.CUSTOMER_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member || member.tenantId !== auth.user.tenantId) return apiError(404, "ไม่พบสมาชิก");
  const orders = await prisma.salesOrder.findMany({
    where: { memberId: id, branch: { tenantId: auth.user.tenantId ?? -1 } },
    select: { docNo: true, netAmount: true, createdAt: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 500, // bound the export; a member with years of history shouldn't OOM the response
  });
  await writeAudit({ userId: auth.user.id, action: "member_export", entity: "member", entityId: id });
  return Response.json({ member, orders });
}

// PDPA right of erasure: anonymize PII but keep order records intact.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.CUSTOMER_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member || member.tenantId !== auth.user.tenantId) return apiError(404, "ไม่พบสมาชิก");

  await prisma.member.update({
    where: { id },
    data: { name: "ลบข้อมูลแล้ว", phone: null, email: null },
  });
  await writeAudit({ userId: auth.user.id, action: "member_erase", entity: "member", entityId: id });
  return Response.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.CUSTOMER_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member || member.tenantId !== auth.user.tenantId) return apiError(404, "ไม่พบสมาชิก");

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลสมาชิกไม่ถูกต้อง");

  const updated = await prisma.member.update({ where: { id }, data: parsed.data });
  await writeAudit({
    userId: auth.user.id, action: "update_member", entity: "member", entityId: id,
    before: member, after: updated,
  });
  return Response.json({ member: updated });
}

const redeemSchema = z.object({
  action: z.literal("redeem"),
  points: z.number().int().positive(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.CUSTOMER_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member || member.tenantId !== auth.user.tenantId) return apiError(404, "ไม่พบสมาชิก");

  const parsed = redeemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลการแลกแต้มไม่ถูกต้อง");

  // atomic balance-guarded decrement: concurrent redeems can't drive points negative
  const claim = await prisma.member.updateMany({
    where: { id, points: { gte: parsed.data.points } },
    data: { points: { decrement: parsed.data.points } },
  });
  if (claim.count === 0) return apiError(400, "แต้มไม่เพียงพอ");

  const updated = await prisma.member.findUnique({ where: { id }, select: { points: true } });
  await writeAudit({
    userId: auth.user.id, action: "redeem_points", entity: "member", entityId: id,
    before: { points: member.points }, after: { points: updated?.points },
  });
  return Response.json({ ok: true, remaining: updated?.points });
}
