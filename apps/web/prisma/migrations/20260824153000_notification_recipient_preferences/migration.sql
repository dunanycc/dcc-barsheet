ALTER TABLE "NotificationSettings"
ADD COLUMN "secondaryShiftFilled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "secondaryShiftRemoved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "secondaryEventFilled" BOOLEAN NOT NULL DEFAULT false;
