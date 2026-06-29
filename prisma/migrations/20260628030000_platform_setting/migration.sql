-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "promptPayId" TEXT,
    "promptPayImage" TEXT,
    "bankInfo" TEXT,
    "updatedBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

