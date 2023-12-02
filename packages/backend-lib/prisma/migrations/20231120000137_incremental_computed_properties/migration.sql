-- CreateEnum
CREATE TYPE "ComputedPropertyType" AS ENUM ('Segment', 'UserProperty');

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "definitionUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "definitionUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "UserProperty" ADD COLUMN     "definitionUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ComputedPropertyPeriod" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "type" "ComputedPropertyType" NOT NULL,
    "computedPropertyId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "from" TIMESTAMP(3),
    "to" TIMESTAMP(3) NOT NULL,
    "step" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComputedPropertyPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComputedPropertyPeriod_workspaceId_type_computedPropertyId__idx" ON "ComputedPropertyPeriod"("workspaceId", "type", "computedPropertyId", "to");

-- AddForeignKey
ALTER TABLE "ComputedPropertyPeriod" ADD CONSTRAINT "ComputedPropertyPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
