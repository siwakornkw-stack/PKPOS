import { prisma } from "@/lib/db";

// Liveness/readiness probe for load balancers + uptime monitoring. Public.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
