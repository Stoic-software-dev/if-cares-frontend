-- Approval of a meal count: who signed off on it and when.
ALTER TABLE "MealCount" ADD COLUMN "approvedAt" TIMESTAMP(3),
                        ADD COLUMN "approvedById" TEXT,
                        ADD COLUMN "approvedByEmail" TEXT NOT NULL DEFAULT '';

ALTER TABLE "MealCount"
  ADD CONSTRAINT "MealCount_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MealCount_approvedAt_idx" ON "MealCount"("approvedAt");
