import { NextRequest } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { requireBranch } from "@/lib/api";
import { promptPayPayload } from "@/lib/promptpay";

// GET ?amount= : returns a PromptPay QR data URL for the current branch's id.
export async function GET(req: NextRequest) {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;

  const branch = await prisma.branch.findUnique({ where: { id: auth.branchId } });
  if (!branch?.promptPayId)
    return Response.json({ configured: false });

  const amountStr = req.nextUrl.searchParams.get("amount");
  const amount = amountStr ? Number(amountStr) : undefined;
  // only embed a finite, positive amount (Infinity > 0 is true, so guard explicitly) -
  // otherwise toFixed() would write "Infinity"/"NaN" into the QR TLV payload
  const validAmount = amount != null && Number.isFinite(amount) && amount > 0 ? amount : undefined;
  const payload = promptPayPayload(branch.promptPayId, validAmount);
  const qr = await QRCode.toDataURL(payload, { margin: 1, width: 240 });

  return Response.json({ configured: true, qr, promptPayId: branch.promptPayId });
}
