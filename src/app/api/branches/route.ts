import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api";

// GET: list branches (used by the branch switcher; only multi-branch users care)
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  const canSwitch = auth.user.permissions.includes("*");
  if (!canSwitch) return Response.json({ branches: [], canSwitch: false });

  const branches = await prisma.branch.findMany({
    where: { isActive: true, tenantId: auth.user.tenantId ?? -1 }, // tenant-scoped
    orderBy: { id: "asc" },
    select: { id: true, code: true, name: true },
  });
  return Response.json({ branches, canSwitch: true, current: auth.user.branchId });
}
