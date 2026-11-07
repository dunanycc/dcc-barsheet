CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "ImportStatus" AS ENUM ('PREVIEWED', 'APPLIED', 'FAILED');
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REMOVED');

CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "shiftCount" INTEGER NOT NULL,
    "signupCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "legacyEventId" TEXT,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "adminNotes" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "importBatchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "displayTime" TEXT NOT NULL,
    "sortMinutes" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "enteredName" TEXT NOT NULL,
    "sourceSlot" INTEGER,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Event_sourceKey_key" ON "Event"("sourceKey");
CREATE INDEX "Event_date_idx" ON "Event"("date");
CREATE INDEX "Event_importBatchId_idx" ON "Event"("importBatchId");
CREATE UNIQUE INDEX "Shift_sourceKey_key" ON "Shift"("sourceKey");
CREATE INDEX "Shift_eventId_sortMinutes_idx" ON "Shift"("eventId", "sortMinutes");
CREATE INDEX "ShiftAssignment_shiftId_status_idx" ON "ShiftAssignment"("shiftId", "status");
CREATE INDEX "ImportBatch_createdAt_idx" ON "ImportBatch"("createdAt");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

ALTER TABLE "Event"
ADD CONSTRAINT "Event_importBatchId_fkey"
FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Shift"
ADD CONSTRAINT "Shift_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShiftAssignment"
ADD CONSTRAINT "ShiftAssignment_shiftId_fkey"
FOREIGN KEY ("shiftId") REFERENCES "Shift"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
