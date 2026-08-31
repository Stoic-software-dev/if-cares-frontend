-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "programEnd" DATE,
ADD COLUMN     "programStart" DATE,
ADD COLUMN     "weeklyTemplate" JSONB;
