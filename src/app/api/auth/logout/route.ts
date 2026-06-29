import { getSession, destroySession } from "@/lib/auth";
import { writeAudit } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function POST() {
  const user = await getSession();
  if (user) {
    // revoke this user's existing JWTs server-side (stateless token can't be un-issued otherwise)
    await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
    await writeAudit({ userId: user.id, action: "logout" });
  }
  await destroySession();
  return Response.json({ ok: true });
}
