import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/api";
import { PLANS } from "@/lib/plans";
import { round2 } from "@/lib/format";

// GET: all tenants + platform metrics (super-admin only).
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const tenants = await prisma.tenant.findMany({
    orderBy: { id: "desc" },
    include: {
      _count: { select: { branches: true, users: true } },
      branches: { select: { _count: { select: { salesOrders: true } } } },
    },
  });

  const list = tenants.map((t) => ({
    id: t.id, name: t.name, slug: t.slug, plan: t.plan, status: t.status,
    trialEndsAt: t.trialEndsAt, currentPeriodEnd: t.currentPeriodEnd, createdAt: t.createdAt,
    branches: t._count.branches, users: t._count.users,
    orders: t.branches.reduce((s, b) => s + b._count.salesOrders, 0), // total sales orders across branches (0 => empty/junk)
  }));

  const active = list.filter((t) => t.status === "ACTIVE");
  const mrr = round2(active.reduce((s, t) => s + (PLANS[t.plan]?.price ?? 0), 0));
  const metrics = {
    total: list.length,
    active: active.length,
    trial: list.filter((t) => t.status === "TRIAL").length,
    suspended: list.filter((t) => t.status === "SUSPENDED" || t.status === "CANCELLED").length,
    mrr,
  };

  return Response.json({ tenants: list, metrics });
}
