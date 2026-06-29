import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// Never expose the branch's Omise secret key to the client; report only whether one is set.
function redact(branch: { omiseSecretKey: string | null; omisePublicKey?: string | null } & Record<string, unknown>) {
  const { omiseSecretKey, omisePublicKey, ...rest } = branch;
  return { ...rest, hasOmiseSecretKey: !!omiseSecretKey, hasOmisePublicKey: !!omisePublicKey };
}

// GET: settings of the current branch (manager+, secret key redacted)
export async function GET() {
  const auth = await requireBranch(PERMISSIONS.SETTINGS_MANAGE);
  if (auth instanceof Response) return auth;
  const branch = await prisma.branch.findUnique({ where: { id: auth.branchId } });
  if (!branch) return apiError(404, "ไม่พบสาขา");
  return Response.json({ branch: redact(branch) });
}

const schema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  taxRate: z.number().min(0).max(1).optional(),
  serviceRate: z.number().min(0).max(1).optional(),
  receiptHeader: z.string().optional(),
  receiptFooter: z.string().optional(),
  promptPayId: z.string().optional(),
  paymentProvider: z.enum(["MOCK", "OMISE"]).optional(),
  omiseSecretKey: z.string().optional(),
  omisePublicKey: z.string().optional(),
});

// PATCH: update current branch settings
export async function PATCH(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.SETTINGS_MANAGE);
  if (auth instanceof Response) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง", parsed.error.flatten());

  // empty secret key means "leave unchanged" (the form never receives the stored value)
  const data = { ...parsed.data };
  if (!data.omiseSecretKey) delete data.omiseSecretKey;

  const branch = await prisma.branch.update({ where: { id: auth.branchId }, data });
  await writeAudit({ userId: auth.user.id, action: "update_settings", entity: "branch", entityId: auth.branchId });
  return Response.json({ branch: redact(branch) });
}
