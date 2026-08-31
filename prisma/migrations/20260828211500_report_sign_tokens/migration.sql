-- The signing step of a consolidated claim. The token is what a person without
-- an account uses to open and sign the document, so it is opaque, unique and
-- stamped with when it was issued; it is never the id of the report itself.
ALTER TABLE "GeneratedReport" ADD COLUMN     "signedTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signToken" TEXT,
ADD COLUMN     "signTokenSetAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "GeneratedReport_signToken_key" ON "GeneratedReport"("signToken");
