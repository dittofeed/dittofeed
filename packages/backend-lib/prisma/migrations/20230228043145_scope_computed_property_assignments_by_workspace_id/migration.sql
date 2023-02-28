/*
  Warnings:

  - A unique constraint covering the columns `[workspaceId,userPropertyId,userId]` on the table `UserPropertyAssignment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `workspaceId` to the `SegmentAssignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workspaceId` to the `UserPropertyAssignment` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "UserPropertyAssignment_userId_userPropertyId_key";

-- AlterTable
ALTER TABLE "SegmentAssignment" ADD COLUMN     "workspaceId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "UserPropertyAssignment" ADD COLUMN     "workspaceId" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserPropertyAssignment_workspaceId_userPropertyId_userId_key" ON "UserPropertyAssignment"("workspaceId", "userPropertyId", "userId");

-- AddForeignKey
ALTER TABLE "SegmentAssignment" ADD CONSTRAINT "SegmentAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPropertyAssignment" ADD CONSTRAINT "UserPropertyAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
