CREATE TABLE "AdminEmailSettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton', "signature" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AdminEmailSettings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AdminEmail" (
  "id" TEXT NOT NULL, "subject" TEXT NOT NULL, "message" TEXT NOT NULL,
  "signature" TEXT NOT NULL, "recipients" JSONB NOT NULL, "senderName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminEmail_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminEmail_createdAt_idx" ON "AdminEmail"("createdAt");
