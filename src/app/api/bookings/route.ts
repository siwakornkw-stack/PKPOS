import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { nextDocNo } from "@/lib/docno";
import { round2 } from "@/lib/format";

const SLOT_MS = 90 * 60_000; // a table is considered "taken" within +/- 90 min of a booking

// GET: list bookings for branch ordered by bookingTime asc (optional ?status=)
export async function GET(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.CUSTOMER_MANAGE);
  if (auth instanceof Response) return auth;
  const status = req.nextUrl.searchParams.get("status")?.trim();

  const bookings = await prisma.booking.findMany({
    where: { branchId: auth.branchId, ...(status ? { status } : {}) },
    orderBy: { bookingTime: "asc" },
    include: {
      table: { select: { code: true } },
      member: { select: { name: true } },
    },
  });

  return Response.json({ bookings });
}

const schema = z.object({
  customerName: z.string().min(1),
  phone: z.string().min(1),
  guestCount: z.number().int().positive().default(2),
  bookingTime: z.string().min(1),
  tableId: z.number().int().optional(),
  memberId: z.number().int().optional(),
  deposit: z.number().min(0).optional(),
  note: z.string().optional(),
});

// POST: create a booking
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.CUSTOMER_MANAGE);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลการจองไม่ถูกต้อง");
  const d = parsed.data;

  const when = new Date(d.bookingTime);
  if (isNaN(when.getTime())) return apiError(400, "เวลาจองไม่ถูกต้อง");
  if (when.getTime() < Date.now() - 5 * 60_000) return apiError(400, "เวลาจองต้องเป็นอนาคต");

  if (d.tableId != null) {
    const table = await prisma.diningTable.findUnique({ where: { id: d.tableId } });
    if (!table || table.branchId !== branchId) return apiError(404, "ไม่พบโต๊ะ");
    // prevent double-booking the same table within a slot window
    const clash = await prisma.booking.findFirst({
      where: {
        branchId, tableId: d.tableId, status: { in: ["BOOKED", "ARRIVED"] },
        bookingTime: { gte: new Date(when.getTime() - SLOT_MS), lt: new Date(when.getTime() + SLOT_MS) },
      },
    });
    if (clash) return apiError(409, "โต๊ะนี้ถูกจองในช่วงเวลาดังกล่าวแล้ว");
  }
  if (d.memberId != null) {
    const mem = await prisma.member.findUnique({ where: { id: d.memberId }, select: { tenantId: true } });
    if (!mem || mem.tenantId !== user.tenantId) return apiError(404, "ไม่พบสมาชิก");
  }

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return apiError(500, "ไม่พบข้อมูลสาขา");

  const booking = await prisma.booking.create({
    data: {
      docNo: await nextDocNo("BK", branch.code),
      branchId,
      memberId: d.memberId,
      tableId: d.tableId,
      customerName: d.customerName,
      phone: d.phone,
      guestCount: d.guestCount,
      bookingTime: when,
      deposit: round2(d.deposit ?? 0),
      status: "BOOKED",
      note: d.note,
    },
  });

  await writeAudit({
    userId: user.id, action: "create_booking", entity: "booking", entityId: booking.id, after: booking,
  });

  return Response.json({ booking });
}
