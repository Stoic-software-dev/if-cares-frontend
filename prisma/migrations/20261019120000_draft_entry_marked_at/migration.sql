-- STOIC-2771. When each mark was tapped, on the phone that tapped it. A phone
-- that was offline for hours sends its marks late; with this the newer tap wins
-- instead of whichever reached the server last. Null for rows written before
-- the column existed, which count as older than any tap that has a time.
-- Additive and idempotent: safe to run twice against the shared base.

ALTER TABLE "MealCountDraftEntry" ADD COLUMN IF NOT EXISTS "markedAt" TIMESTAMP(3);
