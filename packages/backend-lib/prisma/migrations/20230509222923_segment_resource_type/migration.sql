-- CreateEnum
CREATE TYPE "DBResourceType" AS ENUM ('Declarative', 'Internal');

-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "resourceType" "DBResourceType" NOT NULL DEFAULT 'Declarative';

-- CreateIndex
CREATE INDEX "Segment_resourceType_idx" ON "Segment"("resourceType");
