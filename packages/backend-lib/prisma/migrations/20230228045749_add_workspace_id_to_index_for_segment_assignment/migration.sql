/*
  Warnings:

  - A unique constraint covering the columns `[workspaceId,userId,segmentId]` on the table `SegmentAssignment` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "SegmentAssignment_userId_segmentId_key";

-- CreateIndex
CREATE UNIQUE INDEX "SegmentAssignment_workspaceId_userId_segmentId_key" ON "SegmentAssignment"("workspaceId", "userId", "segmentId");
