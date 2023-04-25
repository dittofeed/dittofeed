-- CreateEnum
CREATE TYPE "DBRoleType" AS ENUM ('Admin', 'WorkspaceManager', 'Author', 'Viewer');

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMemberRole" (
    "workspaceId" UUID NOT NULL,
    "workspaceMemberId" UUID NOT NULL,
    "role" "DBRoleType" NOT NULL DEFAULT 'Viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_email_key" ON "WorkspaceMember"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_externalId_key" ON "WorkspaceMember"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMemberRole_workspaceId_workspaceMemberId_key" ON "WorkspaceMemberRole"("workspaceId", "workspaceMemberId");

-- AddForeignKey
ALTER TABLE "WorkspaceMemberRole" ADD CONSTRAINT "WorkspaceMemberRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMemberRole" ADD CONSTRAINT "WorkspaceMemberRole_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
