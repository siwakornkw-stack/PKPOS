import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/api";

// GET: subscription transfer payments for review (super-admin only).
// Pending rows include the slip image; reviewed history is metadata-only (slips are large).
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const pending = await prisma.subscriptionPayment.findMany({
    where: { status: "PENDING" },
    orderBy: { id: "asc" },
    take: 200, // bound the review queue so a flood of pending rows can't blow up the response
    include: { tenant: { select: { name: true, slug: true, status: true } } },
  });
  const recent = await prisma.subscriptionPayment.findMany({
    where: { status: { not: "PENDING" } },
    orderBy: { id: "desc" },
    take: 20,
    select: {
      id: true, plan: true, amount: true, method: true, status: true, ref: true,
      reviewedAt: true, note: true, createdAt: true,
      tenant: { select: { name: true, slug: true } },
    },
  });
  return Response.json({ pending, recent });
}
