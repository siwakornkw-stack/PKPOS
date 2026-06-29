-- Enforce one OPEN attendance row per (branch, user). This is a PARTIAL unique index (a WHERE
-- predicate Prisma's schema can't model, so it lives in raw SQL only). It closes the clock-in
-- TOCTOU race at the DB layer: a concurrent second clock-in now fails with a unique violation
-- (P2002), which the route maps to 409 instead of creating a duplicate open row.
CREATE UNIQUE INDEX "Attendance_open_per_user_key" ON "Attendance"("branchId", "userId") WHERE "clockOut" IS NULL;
