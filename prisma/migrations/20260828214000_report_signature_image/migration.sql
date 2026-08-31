-- The signature image itself, so a signed claim can be reproduced from the
-- database alone rather than only from the file store.
ALTER TABLE "GeneratedReport" ADD COLUMN     "signature" TEXT NOT NULL DEFAULT '';
