import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(PERMISSIONS.CUSTOMER_MANAGE);
  if (auth instanceof Response) return auth;
  const q = req.nextUrl.searchParams.get("q")?.trim();

  const members = await prisma.member.findMany({
    where: {
      tenantId: auth.user.tenantId,
      ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { code: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { tier: { select: { name: true } } },
  });
  return Response.json({ members });
}

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(PERMISSIONS.CUSTOMER_MANAGE);
  if (auth instanceof Response) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลลูกค้าไม่ถูกต้อง");

  // atomic per-tenant running code (count() is racy and collides under concurrency)
  const counter = await prisma.counter.upsert({
    where: { key: `MEM-${auth.user.tenantId ?? 0}` },
    create: { key: `MEM-${auth.user.tenantId ?? 0}`, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  const code = `MEM${String(counter.seq).padStart(3, "0")}`;

  const member = await prisma.member.create({
    data: { code, tenantId: auth.user.tenantId, ...parsed.data },
  });
  await writeAudit({
    userId: auth.user.id, action: "create_member", entity: "member", entityId: member.id,
  });
  return Response.json({ member });
}
