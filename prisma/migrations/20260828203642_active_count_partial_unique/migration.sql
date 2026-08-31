-- DropIndex
DROP INDEX "MealCount_siteId_date_key";

-- Prisma cannot express a partial unique index, so it is created by hand: only
-- ONE ACTIVE count is allowed per site and date. Voided rows are exempt, which
-- is what lets a day keep the count that was thrown out alongside the one that
-- replaced it without losing either for the audit trail.
CREATE UNIQUE INDEX "MealCount_siteId_date_active_key"
  ON "MealCount"("siteId", "date")
  WHERE "voidedAt" IS NULL;
