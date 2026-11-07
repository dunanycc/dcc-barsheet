-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_importBatchId_fkey";

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "importBatchId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
