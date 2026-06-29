import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/ratelimit";

// PUBLIC (token-auth): the on-site print-agent (running inside the shop's LAN) polls here for
// queued print/drawer jobs and reports results. The cloud server can't reach a LAN printer
// directly, so jobs are queued (Branch.printMode = "agent") and pulled by the agent.
// Auth = Branch.printAgentToken. Assumes ONE agent per branch.
async function branchForToken(token: string | null) {
  if (!token) return null;
  return prisma.branch.findFirst({ where: { printAgentToken: token } });
}

// GET ?token=... : claim up to 10 pending jobs (marks them SENT so the next poll won't re-serve).
export async function GET(req: NextRequest) {
  if (!rateLimit(`printagent:${clientIp(req.headers)}`, 180, 60_000)) return new Response("rate limited", { status: 429 });
  const branch = await branchForToken(req.nextUrl.searchParams.get("token"));
  if (!branch) return Response.json({ error: "unauthorized" }, { status: 401 });

  const jobs = await prisma.printJob.findMany({
    where: { branchId: branch.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  if (jobs.length)
    await prisma.printJob.updateMany({
      where: { id: { in: jobs.map((j) => j.id) }, status: "PENDING" },
      data: { status: "SENT", claimedAt: new Date() },
    });
  return Response.json({ jobs: jobs.map((j) => ({ id: j.id, kind: j.kind, host: j.host, port: j.port, payload: j.payload })) });
}

// POST { token, jobId, ok, error } : report a job's result.
export async function POST(req: NextRequest) {
  if (!rateLimit(`printagent:${clientIp(req.headers)}`, 360, 60_000)) return new Response("rate limited", { status: 429 });
  const body = await req.json().catch(() => null);
  const branch = await branchForToken(body?.token ?? null);
  if (!branch) return Response.json({ error: "unauthorized" }, { status: 401 });
  const jobId = Number(body?.jobId);
  if (!jobId) return Response.json({ error: "bad jobId" }, { status: 400 });

  await prisma.printJob.updateMany({
    where: { id: jobId, branchId: branch.id },
    data: { status: body?.ok ? "DONE" : "ERROR", error: body?.error ? String(body.error).slice(0, 300) : null, doneAt: new Date() },
  });
  return Response.json({ ok: true });
}
