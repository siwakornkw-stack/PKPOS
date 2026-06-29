import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.AUDIT_VIEW);
  if (auth instanceof Response) return auth;
  const raw = req.nextUrl.searchParams.get("take");
  const n = Number(raw);
  // default 100 when absent/invalid; Number(null) is 0 (finite), so guard on the raw value
  const take = raw && Number.isFinite(n) ? Math.min(200, Math.max(1, Math.trunc(n))) : 100;

  // AuditLog has no branchId column - scope by the acting user's branch.
  const logs = await prisma.auditLog.findMany({
    where: { user: { branchId: auth.branchId } },
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { fullName: true, username: true } } },
  });
  return Response.json({ logs });
}
