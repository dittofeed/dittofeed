-- DropIndex
DROP INDEX "SubscriptionGroup_workspaceId_key";

-- CreateIndex
CREATE INDEX "SubscriptionGroup_workspaceId_idx" ON "SubscriptionGroup"("workspaceId");
