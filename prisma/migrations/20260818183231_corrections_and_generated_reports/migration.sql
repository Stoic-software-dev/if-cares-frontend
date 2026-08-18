-- CreateTable
CREATE TABLE "MealCountCorrection" (
    "id" TEXT NOT NULL,
    "mealCountId" TEXT NOT NULL,
    "correctedById" TEXT,
    "correctedByEmail" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "previous" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealCountCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedReport" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL DEFAULT '',
    "signedBy" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdByEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealCountCorrection_mealCountId_idx" ON "MealCountCorrection"("mealCountId");

-- CreateIndex
CREATE INDEX "GeneratedReport_year_month_state_idx" ON "GeneratedReport"("year", "month", "state");

-- AddForeignKey
ALTER TABLE "MealCountCorrection" ADD CONSTRAINT "MealCountCorrection_mealCountId_fkey" FOREIGN KEY ("mealCountId") REFERENCES "MealCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealCountCorrection" ADD CONSTRAINT "MealCountCorrection_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
