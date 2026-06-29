import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { nextDocNo } from "@/lib/docno";
import { round2 } from "@/lib/format";

const countSchema = z.object({
  counts: z
    .array(
      z.object({
        ingredientId: z.number().int(),
        countedQty: z.number(),
      })
    )
    .min(1),
});

// POST: physical stock count session - record variances and adjust stock
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.INVENTORY_MANAGE);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;

  const parsed = countSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");
  const { counts } = parsed.data;

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return apiError(500, "ไม่พบข้อมูลสาขา");

  const out = await prisma
    .$transaction(async (tx) => {
      const variances: {
        name: string;
        before: number;
        counted: number;
        variance: number;
      }[] = [];

      for (const c of counts) {
        const fresh = await tx.ingredient.findUnique({ where: { id: c.ingredientId } });
        if (!fresh || fresh.branchId !== branchId) throw new Error("NOT_FOUND");

        const counted = round2(c.countedQty);
        const variance = round2(counted - fresh.stockQty);

        variances.push({
          name: fresh.name,
          before: fresh.stockQty,
          counted,
          variance,
        });

        if (variance !== 0) {
          await tx.stockMovement.create({
            data: {
              docNo: await nextDocNo("STK", branch.code, tx),
              branchId,
              ingredientId: fresh.id,
              type: "COUNT",
              qty: variance,
              balanceAfter: counted,
              note: "นับสต็อก",
              createdBy: user.id,
            },
          });
          await tx.ingredient.update({
            where: { id: fresh.id },
            data: { stockQty: counted },
          });
        }
      }

      return variances;
    })
    .catch((e) => (e instanceof Error ? e.message : "ERR"));

  if (out === "NOT_FOUND") return apiError(404, "ไม่พบวัตถุดิบ");
  if (typeof out === "string") throw new Error(out);

  const adjusted = out.filter((v) => v.variance !== 0).length;

  await writeAudit({
    userId: user.id,
    action: "stock_count",
    entity: "branch",
    entityId: branchId,
    after: { adjusted, variances: out },
  });

  return Response.json({ adjusted, variances: out });
}
