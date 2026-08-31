-- CreateTable
CREATE TABLE "ClientError" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT NOT NULL,
    "pathname" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "lastEmail" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ClientError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientError_fingerprint_key" ON "ClientError"("fingerprint");

-- CreateIndex
CREATE INDEX "ClientError_lastSeenAt_idx" ON "ClientError"("lastSeenAt");

-- CreateIndex
CREATE INDEX "ClientError_resolvedAt_idx" ON "ClientError"("resolvedAt");
