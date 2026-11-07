ALTER TABLE "User" ADD COLUMN "hiddenAt" TIMESTAMP(3);

CREATE INDEX "User_hiddenAt_idx" ON "User"("hiddenAt");
