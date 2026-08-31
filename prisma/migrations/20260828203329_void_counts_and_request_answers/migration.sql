-- AlterTable
ALTER TABLE "MealCount" ADD COLUMN     "voidReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedByEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "respondedByEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "respondedById" TEXT,
ADD COLUMN     "responseComment" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "MealCount_voidedAt_idx" ON "MealCount"("voidedAt");

-- AddForeignKey
ALTER TABLE "MealCount" ADD CONSTRAINT "MealCount_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
