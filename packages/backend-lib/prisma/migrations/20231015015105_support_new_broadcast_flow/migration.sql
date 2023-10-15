/*
  Warnings:

  - The `status` column on the `Broadcast` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "SegmentStatus" AS ENUM ('NotStarted', 'Running', 'Paused');

-- CreateEnum
CREATE TYPE "DBBroadcastStatus" AS ENUM ('NotStarted', 'InProgress', 'Triggered');

-- AlterEnum
ALTER TYPE "JourneyStatus" ADD VALUE 'Broadcast';

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "journeyId" UUID,
ADD COLUMN     "messageTemplateId" UUID,
DROP COLUMN "status",
ADD COLUMN     "status" "DBBroadcastStatus" NOT NULL DEFAULT 'NotStarted';

-- AlterTable
ALTER TABLE "Journey" ADD COLUMN     "resourceType" "DBResourceType" NOT NULL DEFAULT 'Declarative';

-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "resourceType" "DBResourceType" NOT NULL DEFAULT 'Declarative';

-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "status" "SegmentStatus" NOT NULL DEFAULT 'Running';

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_messageTemplateId_fkey" FOREIGN KEY ("messageTemplateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
