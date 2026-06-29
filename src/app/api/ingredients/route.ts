import { prisma } from "@/lib/db";
import { requireBranch } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// GET: list active ingredients for branch (for recipe/BOM editor)
export async function GET() {
  const auth = await requireBranch(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;
  const { branchId } = auth;

  const ingredients = await prisma.ingredient.findMany({
    where: { branchId, isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, unit: true },
  });
  return Response.json({ ingredients });
}
