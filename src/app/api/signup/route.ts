import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api";
import { hashPassword, authenticate, createSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { TRIAL_DAYS } from "@/lib/plans";

const schema = z.object({
  businessName: z.string().min(2),
  branchName: z.string().min(1),
  ownerName: z.string().min(1),
  username: z.string().min(3),
  pin: z.string().min(4).max(20),
});

function slugify(s: string) {
  const base = s.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  return base || "shop";
}

// PUBLIC: a restaurant signs up -> new tenant on a 14-day trial + owner + branch.
export async function POST(req: NextRequest) {
  if (!rateLimit(`signup:${clientIp(req.headers)}`, 5, 60_000))
    return apiError(429, "พยายามสมัครบ่อยเกินไป");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "กรอกข้อมูลให้ครบ", parsed.error.flatten());
  const d = parsed.data;

  if (await prisma.user.findUnique({ where: { username: d.username } }))
    return apiError(409, "ชื่อผู้ใช้นี้มีอยู่แล้ว");

  const ownerRole = await prisma.role.findUnique({ where: { code: "OWNER" } });
  if (!ownerRole) return apiError(500, "ระบบยังไม่พร้อม (ไม่มี role) - รัน db:seed ก่อน");

  // unique slug + branch code
  let slug = slugify(d.businessName);
  for (let i = 0; await prisma.tenant.findUnique({ where: { slug } }); i++) slug = `${slugify(d.businessName)}-${i + 2}`;

  const hash = await hashPassword(d.pin);
  const conflict = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: d.businessName, slug, plan: "TRIAL", status: "TRIAL", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400000) },
    });
    const branch = await tx.branch.create({
      data: { tenantId: tenant.id, code: `${slug}-1`.toUpperCase(), name: d.branchName },
    });
    await tx.user.create({
      data: { username: d.username, fullName: d.ownerName, passwordHash: hash, pin: hash, roleId: ownerRole.id, branchId: branch.id, tenantId: tenant.id },
    });
    // starter data so the new shop isn't empty (they edit later)
    for (let i = 1; i <= 4; i++)
      await tx.diningTable.create({ data: { branchId: branch.id, code: `T${i}`, zone: "โซน A", seats: 4, posX: i, posY: 1 } });
    const cat = await tx.menuCategory.create({ data: { branchId: branch.id, name: "เมนูแนะนำ", station: "ครัว", sortOrder: 0 } });
    const samples = [["M001", "เมนูตัวอย่าง 1", 60], ["M002", "เมนูตัวอย่าง 2", 80], ["M003", "เครื่องดื่ม", 30]] as const;
    for (const [code, name, price] of samples)
      await tx.menuItem.create({ data: { branchId: branch.id, categoryId: cat.id, code, name, price } });
  }).then(() => null).catch((e) => {
    // a concurrent signup can win the username/slug race between our pre-check and create;
    // the DB unique constraint is the real guard - surface it as a clean 409 instead of a 500.
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002")
      return apiError(409, "ชื่อผู้ใช้หรือชื่อร้านนี้เพิ่งถูกใช้ กรุณาลองใหม่อีกครั้ง");
    throw e;
  });
  if (conflict) return conflict;

  const result = await authenticate(d.username, d.pin);
  if (result.ok) await createSession(result.user);
  return Response.json({ ok: true });
}
