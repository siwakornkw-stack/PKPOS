-- Menu photo
ALTER TABLE "MenuItem" ADD COLUMN     "imageUrl" TEXT;

-- Print mode + on-site print-agent shared secret
ALTER TABLE "Branch" ADD COLUMN     "printMode" TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE "Branch" ADD COLUMN     "printAgentToken" TEXT;

-- Print-job queue pulled by the on-site print-agent (cloud deploys can't reach a LAN printer)
CREATE TABLE "PrintJob" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 9100,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrintJob_branchId_status_createdAt_idx" ON "PrintJob"("branchId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
