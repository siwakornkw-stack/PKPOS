-- AlterTable: record points actually earned (tier multiplier applied) so a refund reverses the exact amount
ALTER TABLE "SalesOrder" ADD COLUMN     "pointsEarned" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "StockMovement_branchId_createdAt_idx" ON "StockMovement"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_ingredientId_idx" ON "StockMovement"("ingredientId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Shift_branchId_userId_status_idx" ON "Shift"("branchId", "userId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex (per-branch promotion code uniqueness, matching Voucher)
CREATE UNIQUE INDEX "Promotion_branchId_code_key" ON "Promotion"("branchId", "code");
