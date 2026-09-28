-- The hours a site usually serves, so the meal count form starts filled in
-- instead of every site typing the same Time In and Time Out each day.
-- Additive and empty by default: sites without them behave as before.
ALTER TABLE "Site" ADD COLUMN "usualTimeIn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Site" ADD COLUMN "usualTimeOut" TEXT NOT NULL DEFAULT '';
