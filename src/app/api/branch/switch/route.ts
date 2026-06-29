import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, apiError, writeAudit } from "@/lib/api";
import { createSession } from "@/lib/auth";

const schema = z.object({ branchId: z.number().int() });

// POST: switch the active branch for the current session (multi-branch owner).
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;
  if (!auth.user.permissions.includes("*"))
    return apiError(403, "ไม่มีสิทธิ์สลับสาขา");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const branch = await prisma.branch.findUnique({ where: { id: parsed.data.branchId } });
  if (!branch || !branch.isActive || branch.tenantId !== auth.user.tenantId)
    return apiError(404, "ไม่พบสาขา"); // tenant isolation

  await createSession({
    ...auth.user,
    branchId: branch.id,
    branchName: branch.name,
  });
  await writeAudit({ userId: auth.user.id, action: "switch_branch", entity: "branch", entityId: branch.id });

  return Response.json({ ok: true, branchId: branch.id, branchName: branch.name });
}
