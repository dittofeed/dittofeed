-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('Root', 'Child', 'Parent');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "type" "WorkspaceType" NOT NULL DEFAULT 'Root';

-- CreateTable
CREATE TABLE "WorkspaceRelation" (
    "parentWorkspaceId" UUID NOT NULL,
    "childWorkspaceId" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRelation_parentWorkspaceId_childWorkspaceId_key" ON "WorkspaceRelation"("parentWorkspaceId", "childWorkspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceRelation" ADD CONSTRAINT "WorkspaceRelation_parentWorkspaceId_fkey" FOREIGN KEY ("parentWorkspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRelation" ADD CONSTRAINT "WorkspaceRelation_childWorkspaceId_fkey" FOREIGN KEY ("childWorkspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
