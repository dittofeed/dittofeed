-- CreateEnum
CREATE TYPE "DBSubscriptionGroupType" AS ENUM ('OptIn', 'OptOut');

-- CreateTable
CREATE TABLE "SubscriptionGroup" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DBSubscriptionGroupType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionGroup_workspaceId_key" ON "SubscriptionGroup"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionGroup_workspaceId_name_key" ON "SubscriptionGroup"("workspaceId", "name");

-- AddForeignKey
ALTER TABLE "SubscriptionGroup" ADD CONSTRAINT "SubscriptionGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
