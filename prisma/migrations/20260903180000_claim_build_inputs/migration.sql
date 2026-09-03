-- A stored claim has to be reproducible from its own record. Without the
-- exclusion list and the title it was built with, every rebuild (the signing
-- page, the emailed copy, the download when Drive is unreachable) produced a
-- DIFFERENT document under the same file name.
ALTER TABLE "GeneratedReport" ADD COLUMN "excludeSites" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "GeneratedReport" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
