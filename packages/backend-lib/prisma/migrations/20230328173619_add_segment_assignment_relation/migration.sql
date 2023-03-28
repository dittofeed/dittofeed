/*
  Warnings:

  - Changed the type of `segmentId` on the `SegmentAssignment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "SegmentAssignment" ADD COLUMN "segmentId_temp" UUID NOT NULL;

UPDATE "SegmentAssignment"
SET "segmentId_temp" = CAST("segmentId" AS UUID);

ALTER TABLE "SegmentAssignment" DROP COLUMN "segmentId";

ALTER TABLE "SegmentAssignment" RENAME COLUMN "segmentId_temp" TO "segmentId";

-- CreateIndex
CREATE UNIQUE INDEX "SegmentAssignment_workspaceId_userId_segmentId_key" ON "SegmentAssignment"("workspaceId", "userId", "segmentId");

-- AddForeignKey
ALTER TABLE "SegmentAssignment" ADD CONSTRAINT "SegmentAssignment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
