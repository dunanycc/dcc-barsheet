-- Add account session versioning and separate authenticated Users from assigned people.
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "VolunteerRelationship" AS ENUM ('PRIMARY', 'PARTNER');

CREATE TABLE "VolunteerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "relationship" "VolunteerRelationship" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VolunteerProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShiftAssignment" ADD COLUMN "volunteerProfileId" TEXT;

INSERT INTO "VolunteerProfile" ("id", "userId", "firstName", "lastName", "relationship", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "firstName", "lastName", 'PRIMARY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User";

UPDATE "ShiftAssignment" assignment
SET "volunteerProfileId" = profile."id"
FROM "VolunteerProfile" profile
WHERE assignment."userId" = profile."userId"
  AND profile."relationship" = 'PRIMARY';

CREATE INDEX "VolunteerProfile_userId_active_idx" ON "VolunteerProfile"("userId", "active");
CREATE INDEX "VolunteerProfile_lastName_firstName_idx" ON "VolunteerProfile"("lastName", "firstName");
CREATE UNIQUE INDEX "VolunteerProfile_one_primary_per_user" ON "VolunteerProfile"("userId") WHERE "relationship" = 'PRIMARY';
CREATE UNIQUE INDEX "VolunteerProfile_one_active_partner_per_user" ON "VolunteerProfile"("userId") WHERE "relationship" = 'PARTNER' AND "active" = true;
CREATE INDEX "ShiftAssignment_volunteerProfileId_status_idx" ON "ShiftAssignment"("volunteerProfileId", "status");

ALTER TABLE "VolunteerProfile" ADD CONSTRAINT "VolunteerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_volunteerProfileId_fkey" FOREIGN KEY ("volunteerProfileId") REFERENCES "VolunteerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
