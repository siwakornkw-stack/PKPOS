import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { ymCompact, ymdCompact } from "./format";

// Document Numbering Standard (from Process & Data Control slide):
//   SO-BR01-202606-000001
//   prefix - branchCode - YYYYMM - running(6)
export type DocPrefix = "SO" | "RC" | "PO" | "STK" | "BK";

type Client = Prisma.TransactionClient | PrismaClient;

// Pass the active tx client when called inside a $transaction — SQLite is a
// single-writer DB, so using the global client inside an open tx would deadlock.
export async function nextDocNo(
  prefix: DocPrefix,
  branchCode: string,
  client: Client = prisma,
  at: Date = new Date()
): Promise<string> {
  const yyyymm = ymCompact(at); // business-tz month (not server UTC)
  const key = `${prefix}-${branchCode}-${yyyymm}`;

  const counter = await client.counter.upsert({
    where: { key },
    create: { key, seq: 1 },
    update: { seq: { increment: 1 } },
  });

  return `${key}-${String(counter.seq).padStart(6, "0")}`;
}

// Daily running queue number per branch (for takeaway/delivery tickets). Resets each day.
export async function nextQueueNo(
  branchCode: string,
  client: Client = prisma,
  at: Date = new Date()
): Promise<number> {
  const ymd = ymdCompact(at); // business-tz day (queue resets at local midnight, not UTC)
  const counter = await client.counter.upsert({
    where: { key: `Q-${branchCode}-${ymd}` },
    create: { key: `Q-${branchCode}-${ymd}`, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  return counter.seq;
}
