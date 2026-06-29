import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, apiError, writeAudit } from "@/lib/api";
import { deleteTenantCascade } from "@/lib/tenant-admin";

const schema = z.object({
  ids: z.array(z.number().int()).min(1).max(200),
  confirm: z.string(),
});

// POST: permanently delete many tenants at once (super-admin only). Irreversible.
// Requires confirm === "DELETE". ACTIVE tenants are skipped (never bulk-delete a paying one).
// Each tenant is deleted in its own transaction so one failure does not roll back the rest.
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");
  if (parsed.data.confirm !== "DELETE") return apiError(400, 'พิมพ์ "DELETE" เพื่อยืนยัน');

  const tenants = await prisma.tenant.findMany({
    where: { id: { in: parsed.data.ids } },
    select: { id: true, name: true, slug: true, status: true },
  });

  const deleted: { id: number; name: string }[] = [];
  const skipped: { id: number; name: string; reason: string }[] = [];

  for (const t of tenants) {
    if (t.status === "ACTIVE") {
      skipped.push({ id: t.id, name: t.name, reason: "ACTIVE (ระงับก่อนถึงจะลบได้)" });
      continue;
    }
    try {
      const counts = await prisma.$transaction((tx) => deleteTenantCascade(tx, t.id), { timeout: 30000 });
      await writeAudit({
        userId: auth.user.id, action: "delete_tenant", entity: "tenant", entityId: t.id,
        before: { name: t.name, slug: t.slug, status: t.status }, after: counts,
      });
      deleted.push({ id: t.id, name: t.name });
    } catch (e) {
      skipped.push({ id: t.id, name: t.name, reason: e instanceof Error ? e.message : "error" });
    }
  }

  return Response.json({ ok: true, deleted, skipped });
}
