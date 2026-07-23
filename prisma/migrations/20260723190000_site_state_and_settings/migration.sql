-- Review findings (2026-07-23): site state + reminder window from the master
-- sheet, and a key-value settings store for foundation IDs.

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "state" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reminderStart" DATE,
ADD COLUMN     "reminderEnd" DATE;

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
