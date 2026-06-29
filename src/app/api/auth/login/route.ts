import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, createSession } from "@/lib/auth";
import { apiError, writeAudit } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/ratelimit";

const schema = z.object({
  username: z.string().min(1),
  secret: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // throttle by IP: 10 login attempts / minute
  const ip = clientIp(req.headers);
  if (!rateLimit(`login:${ip}`, 10, 60_000))
    return apiError(429, "พยายามเข้าสู่ระบบบ่อยเกินไป ลองใหม่ใน 1 นาที");

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError(400, "กรุณากรอกข้อมูลให้ครบ");

  const result = await authenticate(parsed.data.username, parsed.data.secret);
  if (!result.ok) {
    // leave a forensic trail for failed attempts (brute-force/credential-stuffing visibility);
    // rate limiting above bounds the row volume.
    await writeAudit({ action: "login_failed", entity: "user", entityId: parsed.data.username, ip, after: { reason: result.reason } });
    if (result.reason === "LOCKED")
      return apiError(423, "บัญชีถูกล็อกชั่วคราว (ใส่รหัสผิดหลายครั้ง) ลองใหม่ใน 15 นาที");
    if (result.reason === "INACTIVE") return apiError(403, "บัญชีถูกปิดใช้งาน");
    return apiError(401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }

  const user = result.user;
  await createSession(user);
  await writeAudit({
    userId: user.id,
    action: "login",
    entity: "user",
    entityId: user.id,
    ip, // proxy-aware client IP (matches the value used for rate limiting)
  });

  return Response.json({ ok: true, user });
}
