import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, apiError, writeAudit } from "@/lib/api";

const MAX_IMG_CHARS = 2_800_000; // ~2MB data URL

// GET: platform payment settings (super-admin). Falls back to env when unset.
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;
  const s = await prisma.platformSetting.findUnique({ where: { id: 1 } });
  return Response.json({
    setting: {
      promptPayId: s?.promptPayId ?? null,
      bankInfo: s?.bankInfo ?? null,
      hasImage: !!s?.promptPayImage,
      promptPayImage: s?.promptPayImage ?? null,
      updatedAt: s?.updatedAt ?? null,
    },
    envFallback: { promptPayId: process.env.PLATFORM_PROMPTPAY_ID || null, bankInfo: process.env.PLATFORM_BANK_INFO || null },
  });
}

const schema = z.object({
  promptPayId: z.string().max(40).nullable().optional(),
  bankInfo: z.string().max(500).nullable().optional(),
  // data URL image, or null/"" to clear the uploaded QR
  promptPayImage: z.string().max(MAX_IMG_CHARS).nullable().optional(),
});

// PATCH: update platform payment settings (super-admin). Upserts the single row.
export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  const d = parsed.data;

  const data: Record<string, unknown> = { updatedBy: auth.user.id };
  if (d.promptPayId !== undefined) data.promptPayId = d.promptPayId || null;
  if (d.bankInfo !== undefined) data.bankInfo = d.bankInfo || null;
  if (d.promptPayImage !== undefined) {
    const img = d.promptPayImage || null;
    if (img && !img.startsWith("data:image/")) return apiError(400, "ไฟล์ต้องเป็นรูปภาพ");
    data.promptPayImage = img;
  }

  const setting = await prisma.platformSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
  await writeAudit({ userId: auth.user.id, action: "update_platform_setting", entity: "platform_setting", entityId: 1 });
  return Response.json({ ok: true, hasImage: !!setting.promptPayImage });
}
