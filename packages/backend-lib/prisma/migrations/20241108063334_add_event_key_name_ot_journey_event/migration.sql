/*
  Warnings:

  - A unique constraint covering the columns `[journeyId,userId,eventKey,eventKeyName,type,journeyStartedAt,nodeId]` on the table `UserJourneyEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "UserJourneyEvent_journeyId_userId_eventKey_type_journeyStar_key";

-- AlterTable
ALTER TABLE "UserJourneyEvent" ADD COLUMN     "eventKeyName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserJourneyEvent_journeyId_userId_eventKey_eventKeyName_typ_key" ON "UserJourneyEvent"("journeyId", "userId", "eventKey", "eventKeyName", "type", "journeyStartedAt", "nodeId");
