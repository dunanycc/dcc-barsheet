-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "notifEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifShiftFilled" BOOLEAN NOT NULL DEFAULT true,
    "notifShiftRemoved" BOOLEAN NOT NULL DEFAULT true,
    "notifEventFilled" BOOLEAN NOT NULL DEFAULT true,
    "toEmail" TEXT,
    "ccEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);
