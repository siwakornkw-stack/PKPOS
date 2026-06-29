-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "etaxEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grabStoreId" TEXT,
ADD COLUMN     "lineChannelToken" TEXT,
ADD COLUMN     "lineManStoreId" TEXT,
ADD COLUMN     "shopeeStoreId" TEXT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "tierId" INTEGER;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "barcode" TEXT;

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "buyQty" INTEGER,
ADD COLUMN     "categoryId" INTEGER,
ADD COLUMN     "days" TEXT,
ADD COLUMN     "endMin" INTEGER,
ADD COLUMN     "getQty" INTEGER,
ADD COLUMN     "memberOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "menuItemId" INTEGER,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'ORDER',
ADD COLUMN     "startMin" INTEGER,
ADD COLUMN     "usageLimit" INTEGER,
ADD COLUMN     "usedCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "etaxRef" TEXT,
ADD COLUMN     "etaxStatus" TEXT,
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'POS';

-- CreateTable
CREATE TABLE "MenuTimePrice" (
    "id" SERIAL NOT NULL,
    "menuItemId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT,
    "days" TEXT NOT NULL DEFAULT '0123456',
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuTimePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "clockIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockOut" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTier" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "minSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pointMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MemberTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "menuItemId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_branchId_userId_idx" ON "Attendance"("branchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberTier_tenantId_name_key" ON "MemberTier"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_branchId_barcode_key" ON "MenuItem"("branchId", "barcode");

-- AddForeignKey
ALTER TABLE "MenuTimePrice" ADD CONSTRAINT "MenuTimePrice_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "MemberTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTier" ADD CONSTRAINT "MemberTier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

