-- STOIC-2691. Two additive tables, nothing existing changes:
-- which sites each menu is for (a menu without rows stays for every site), and
-- meal counts saved for later on the server instead of on one phone.
-- Idempotent: safe to run twice against the shared base.

CREATE TABLE IF NOT EXISTS "MenuSite" (
    "fileId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    CONSTRAINT "MenuSite_pkey" PRIMARY KEY ("fileId","siteId"),
    CONSTRAINT "MenuSite_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MenuSite_siteId_idx" ON "MenuSite"("siteId");

CREATE TABLE IF NOT EXISTS "MealCountDraft" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeIn" TEXT NOT NULL DEFAULT '',
    "timeOut" TEXT NOT NULL DEFAULT '',
    "updatedByName" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealCountDraft_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MealCountDraft_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MealCountDraft_siteId_date_key" ON "MealCountDraft"("siteId", "date");

CREATE TABLE IF NOT EXISTS "MealCountDraftEntry" (
    "draftId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "att" BOOLEAN NOT NULL DEFAULT false,
    "brk" BOOLEAN NOT NULL DEFAULT false,
    "lunch" BOOLEAN NOT NULL DEFAULT false,
    "snk" BOOLEAN NOT NULL DEFAULT false,
    "sup" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MealCountDraftEntry_pkey" PRIMARY KEY ("draftId","studentId"),
    CONSTRAINT "MealCountDraftEntry_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "MealCountDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
