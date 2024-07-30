-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('Root', 'Child', 'Parent');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "type" "WorkspaceType" NOT NULL DEFAULT 'Root';

-- CreateTable
CREATE TABLE "WorkspaceRelation" (
    "workspaceId" UUID NOT NULL,
    "childWorkspaceId" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRelation_workspaceId_childWorkspaceId_key" ON "WorkspaceRelation"("workspaceId", "childWorkspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceRelation" ADD CONSTRAINT "WorkspaceRelation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRelation" ADD CONSTRAINT "WorkspaceRelation_childWorkspaceId_fkey" FOREIGN KEY ("childWorkspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
