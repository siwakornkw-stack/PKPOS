import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { chargeCard } from "@/lib/payments/gateway";
import { round2 } from "@/lib/format";

const schema = z.object({
  amount: z.number().positive().finite(), // reject Infinity/NaN (Infinity passes .positive())
  ref: z.string().optional(),
});

// POST: authorize a card charge via the configured gateway (mock in dev).
// The POS card flow calls this to get a real authorization before recording
// the payment on the order.
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลการชำระไม่ถูกต้อง");
  const { amount, ref } = parsed.data;

  const branch = await prisma.branch.findUnique({ where: { id: auth.branchId } });
  const result = await chargeCard(
    { amount: round2(amount), currency: "THB", ref },
    { provider: branch?.paymentProvider, secretKey: branch?.omiseSecretKey ?? undefined }
  );

  if (!result.success)
    return apiError(402, result.message || "ชำระบัตรไม่สำเร็จ");

  await writeAudit({
    userId: user.id,
    action: "card_charge",
    entity: "payment",
    after: { transactionId: result.transactionId, provider: result.provider, amount: round2(amount), ref },
  });

  return Response.json({
    ok: true,
    transactionId: result.transactionId,
    provider: result.provider,
  });
}
