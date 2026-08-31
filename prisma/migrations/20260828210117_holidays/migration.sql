-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "allSites" BOOLEAN NOT NULL DEFAULT true,
    "allMeals" BOOLEAN NOT NULL DEFAULT true,
    "brk" BOOLEAN NOT NULL DEFAULT false,
    "lunch" BOOLEAN NOT NULL DEFAULT false,
    "snk" BOOLEAN NOT NULL DEFAULT false,
    "sup" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidaySite" (
    "holidayId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "HolidaySite_pkey" PRIMARY KEY ("holidayId","siteId")
);

-- CreateIndex
CREATE INDEX "Holiday_startDate_endDate_idx" ON "Holiday"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "HolidaySite_siteId_idx" ON "HolidaySite"("siteId");

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidaySite" ADD CONSTRAINT "HolidaySite_holidayId_fkey" FOREIGN KEY ("holidayId") REFERENCES "Holiday"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidaySite" ADD CONSTRAINT "HolidaySite_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
