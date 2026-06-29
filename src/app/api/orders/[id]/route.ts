import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, apiError } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      items: { orderBy: { createdAt: "asc" }, include: { options: true } },
      table: true,
      member: true,
      payments: true,
      user: { select: { fullName: true } },
    },
  });
  if (!order || order.branchId !== auth.branchId)
    return apiError(404, "ไม่พบออเดอร์");
  return Response.json({ order });
}
