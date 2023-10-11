-- CreateEnum
CREATE TYPE "SegmentStatus" AS ENUM ('NotStarted', 'Running', 'Paused');

-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "status" "SegmentStatus" NOT NULL DEFAULT 'Running';
