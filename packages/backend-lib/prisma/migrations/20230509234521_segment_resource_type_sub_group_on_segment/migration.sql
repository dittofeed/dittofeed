-- CreateEnum
CREATE TYPE "DBResourceType" AS ENUM ('Declarative', 'Internal');

-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "resourceType" "DBResourceType" NOT NULL DEFAULT 'Declarative',
ADD COLUMN     "subscriptionGroupId" UUID;

-- CreateIndex
CREATE INDEX "Segment_resourceType_idx" ON "Segment"("resourceType");

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_subscriptionGroupId_fkey" FOREIGN KEY ("subscriptionGroupId") REFERENCES "SubscriptionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
