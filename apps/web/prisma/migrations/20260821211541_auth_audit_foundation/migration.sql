/*
  Warnings:

  - The required column `operationId` was added to the `AuditEvent` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `operationId` was added to the `ImportBatch` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `operationId` was added to the `ShiftAssignment` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'ACTIVE', 'DISABLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INITIAL_AUTHORIZATION', 'ACCESS_APPROVED', 'VOLUNTEER_REPLACED', 'EVENT_CHANGED', 'ADMIN_ALERT', 'SHIFT_FILLED', 'SHIFT_REMOVED', 'EVENT_FILLED');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('GOOGLE', 'EMAIL_ASSERTION');

-- CreateEnum
CREATE TYPE "AccessAttemptOutcome" AS ENUM ('ACCEPTED', 'HONEYPOT_REJECTED', 'IP_RATE_LIMITED', 'EMAIL_RATE_LIMITED', 'COOLDOWN_REJECTED', 'DUPLICATE_PENDING');

-- AlterEnum
ALTER TYPE "AssignmentStatus" ADD VALUE 'REPLACED';

-- DropForeignKey
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_eventId_fkey";

-- DropForeignKey
ALTER TABLE "ShiftAssignment" DROP CONSTRAINT "ShiftAssignment_shiftId_fkey";

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "actorEmailSnapshot" TEXT,
ADD COLUMN     "actorNameSnapshot" TEXT,
ADD COLUMN     "actorUserId" TEXT,
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "newData" JSONB,
ADD COLUMN     "operationId" TEXT NOT NULL,
ADD COLUMN     "previousData" JSONB,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "status" "EventStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "operationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ShiftAssignment" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "operationId" TEXT NOT NULL,
ADD COLUMN     "replacedAssignmentId" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "lastAuthenticatedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "disabledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "verifiedEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "pendingKey" TEXT,
    "operationId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooldownUntil" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "approvedUserId" TEXT,
    "decisionReason" TEXT,
    "requestIp" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRequestAttempt" (
    "id" TEXT NOT NULL,
    "normalizedEmail" TEXT,
    "ipAddress" TEXT,
    "outcome" "AccessAttemptOutcome" NOT NULL,
    "operationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRequestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT,
    "payload" JSONB NOT NULL,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "eventId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");

-- CreateIndex
CREATE INDEX "User_status_role_idx" ON "User"("status", "role");

-- CreateIndex
CREATE INDEX "User_lastName_firstName_idx" ON "User"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_providerAccountId_key" ON "ExternalIdentity"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRequest_pendingKey_key" ON "AccessRequest"("pendingKey");

-- CreateIndex
CREATE INDEX "AccessRequest_normalizedEmail_requestedAt_idx" ON "AccessRequest"("normalizedEmail", "requestedAt");

-- CreateIndex
CREATE INDEX "AccessRequest_status_requestedAt_idx" ON "AccessRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "AccessRequestAttempt_ipAddress_createdAt_idx" ON "AccessRequestAttempt"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "AccessRequestAttempt_normalizedEmail_createdAt_idx" ON "AccessRequestAttempt"("normalizedEmail", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_operationId_idx" ON "Notification"("operationId");

-- CreateIndex
CREATE INDEX "Notification_recipientEmail_createdAt_idx" ON "Notification"("recipientEmail", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_operationId_createdAt_idx" ON "AuditEvent"("operationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_eventId_createdAt_idx" ON "AuditEvent"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "ShiftAssignment_userId_status_idx" ON "ShiftAssignment"("userId", "status");

-- CreateIndex
CREATE INDEX "ShiftAssignment_operationId_idx" ON "ShiftAssignment"("operationId");

-- CreateIndex
CREATE INDEX "ShiftAssignment_replacedAssignmentId_idx" ON "ShiftAssignment"("replacedAssignmentId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_approvedUserId_fkey" FOREIGN KEY ("approvedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_replacedAssignmentId_fkey" FOREIGN KEY ("replacedAssignmentId") REFERENCES "ShiftAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Application normalization is reinforced at the database boundary so the
-- unique index cannot be bypassed by mixed-case or padded normalized values.
ALTER TABLE "User" ADD CONSTRAINT "User_normalizedEmail_normalized_check"
CHECK (
  "normalizedEmail" = lower(btrim("normalizedEmail"))
  AND length("normalizedEmail") > 0
);

ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_normalizedEmail_normalized_check"
CHECK (
  "normalizedEmail" = lower(btrim("normalizedEmail"))
  AND length("normalizedEmail") > 0
);

-- PostgreSQL unique indexes permit multiple NULL values. pendingKey is set to
-- normalizedEmail only while pending, enforcing one open request per address
-- while allowing approved/rejected history to remain.
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_pendingKey_state_check"
CHECK (
  ("status" = 'PENDING' AND "pendingKey" = "normalizedEmail")
  OR ("status" <> 'PENDING' AND "pendingKey" IS NULL)
);

-- Audit rows are append-only. The application migration role can still manage
-- the trigger deliberately during a reviewed recovery or schema migration.
CREATE FUNCTION "prevent_audit_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent records are immutable';
END;
$$;

CREATE TRIGGER "AuditEvent_immutable"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_audit_event_mutation"();
