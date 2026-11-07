ALTER TYPE "NotificationStatus" ADD VALUE 'PROCESSING';

ALTER TYPE "NotificationType" ADD VALUE 'ACCESS_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_REMOVED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_REPLACED';
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'TEST_EMAIL';

ALTER TABLE "Notification"
ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN "claimedAt" TIMESTAMP(3),
ADD COLUMN "claimToken" TEXT;

CREATE UNIQUE INDEX "Notification_claimToken_key" ON "Notification"("claimToken");
CREATE INDEX "Notification_status_nextAttemptAt_createdAt_idx" ON "Notification"("status", "nextAttemptAt", "createdAt");
