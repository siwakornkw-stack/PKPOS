import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { round2 } from "@/lib/format";

const SLOT_MS = 90 * 60_000; // a table is considered "taken" within +/- 90 min of a booking

const schema = z.object({
  status: z.enum(["BOOKED", "ARRIVED", "CANCELLED", "NO_SHOW"]).optional(),
  customerName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  guestCount: z.number().int().positive().optional(),
  bookingTime: z.string().min(1).optional(),
  tableId: z.number().int().nullable().optional(),
  memberId: z.number().int().nullable().optional(),
  deposit: z.number().min(0).optional(),
  note: z.string().optional(),
});

// PATCH: update status and/or fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.CUSTOMER_MANAGE);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;
  const id = Number((await params).id);

  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing || existing.branchId !== branchId) return apiError(404, "ไม่พบการจอง");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลการจองไม่ถูกต้อง");
  const d = parsed.data;

  // only an open (BOOKED) reservation can change status; terminal states can't be reopened
  if (d.status != null && d.status !== existing.status && existing.status !== "BOOKED")
    return apiError(409, "เปลี่ยนสถานะการจองนี้ไม่ได้แล้ว");

  let when: Date | undefined;
  if (d.bookingTime != null) {
    when = new Date(d.bookingTime);
    if (isNaN(when.getTime())) return apiError(400, "เวลาจองไม่ถูกต้อง");
    if (when.getTime() < Date.now() - 5 * 60_000) return apiError(400, "เวลาจองต้องเป็นอนาคต");
  }

  if (d.tableId != null) {
    const table = await prisma.diningTable.findUnique({ where: { id: d.tableId } });
    if (!table || table.branchId !== branchId) return apiError(404, "ไม่พบโต๊ะ");
    // prevent double-booking when (re)assigning a table or moving the time
    const at = when ?? existing.bookingTime;
    const clash = await prisma.booking.findFirst({
      where: {
        branchId, tableId: d.tableId, id: { not: id }, status: { in: ["BOOKED", "ARRIVED"] },
        bookingTime: { gte: new Date(at.getTime() - SLOT_MS), lt: new Date(at.getTime() + SLOT_MS) },
      },
    });
    if (clash) return apiError(409, "โต๊ะนี้ถูกจองในช่วงเวลาดังกล่าวแล้ว");
  }
  if (d.memberId != null) {
    const mem = await prisma.member.findUnique({ where: { id: d.memberId }, select: { tenantId: true } });
    if (!mem || mem.tenantId !== auth.user.tenantId) return apiError(404, "ไม่พบสมาชิก");
  }

  const booking = await prisma.booking.update({
    where: { id },
    data: {
      ...(d.status != null ? { status: d.status } : {}),
      ...(d.customerName != null ? { customerName: d.customerName } : {}),
      ...(d.phone != null ? { phone: d.phone } : {}),
      ...(d.guestCount != null ? { guestCount: d.guestCount } : {}),
      ...(when != null ? { bookingTime: when } : {}),
      ...(d.tableId !== undefined ? { tableId: d.tableId } : {}),
      ...(d.memberId !== undefined ? { memberId: d.memberId } : {}),
      ...(d.deposit != null ? { deposit: round2(d.deposit) } : {}),
      ...(d.note != null ? { note: d.note } : {}),
    },
  });

  // When marked ARRIVED and a table is set, reserve it - but never stomp a table that a
  // live order already seated (OCCUPIED); only claim a free/reserved one.
  if (booking.status === "ARRIVED" && booking.tableId != null) {
    await prisma.diningTable.updateMany({
      where: { id: booking.tableId, branchId, status: { in: ["AVAILABLE", "RESERVED"] } },
      data: { status: "RESERVED" },
    });
  }
  // Free a previously-reserved table on cancel/no-show, or when the table is reassigned.
  // Guard on status RESERVED so a table since seated by a live order (OCCUPIED) is untouched.
  const freeOld =
    (booking.status === "CANCELLED" || booking.status === "NO_SHOW") ||
    (d.tableId !== undefined && existing.tableId !== booking.tableId);
  if (freeOld && existing.tableId != null && existing.tableId !== booking.tableId)
    await prisma.diningTable.updateMany({ where: { id: existing.tableId, status: "RESERVED" }, data: { status: "AVAILABLE" } });
  if ((booking.status === "CANCELLED" || booking.status === "NO_SHOW") && booking.tableId != null)
    await prisma.diningTable.updateMany({ where: { id: booking.tableId, status: "RESERVED" }, data: { status: "AVAILABLE" } });

  await writeAudit({
    userId: user.id, action: "update_booking", entity: "booking", entityId: booking.id,
    before: existing, after: booking,
  });

  return Response.json({ booking });
}
