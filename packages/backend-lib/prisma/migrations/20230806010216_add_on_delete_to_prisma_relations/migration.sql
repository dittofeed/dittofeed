-- DropForeignKey
ALTER TABLE "Broadcast" DROP CONSTRAINT "Broadcast_segmentId_fkey";

-- DropForeignKey
ALTER TABLE "CurrentUserEventsTable" DROP CONSTRAINT "CurrentUserEventsTable_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "DefaultEmailProvider" DROP CONSTRAINT "DefaultEmailProvider_emailProviderId_fkey";

-- DropForeignKey
ALTER TABLE "DefaultEmailProvider" DROP CONSTRAINT "DefaultEmailProvider_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "EmailProvider" DROP CONSTRAINT "EmailProvider_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "EmailTemplate" DROP CONSTRAINT "EmailTemplate_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "Journey" DROP CONSTRAINT "Journey_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "MessageTemplate" DROP CONSTRAINT "MessageTemplate_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "Segment" DROP CONSTRAINT "Segment_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "SegmentAssignment" DROP CONSTRAINT "SegmentAssignment_segmentId_fkey";

-- DropForeignKey
ALTER TABLE "SegmentAssignment" DROP CONSTRAINT "SegmentAssignment_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "SegmentIOConfiguration" DROP CONSTRAINT "SegmentIOConfiguration_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "UserJourneyEvent" DROP CONSTRAINT "UserJourneyEvent_journeyId_fkey";

-- DropForeignKey
ALTER TABLE "UserProperty" DROP CONSTRAINT "UserProperty_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "UserPropertyAssignment" DROP CONSTRAINT "UserPropertyAssignment_userPropertyId_fkey";

-- DropForeignKey
ALTER TABLE "UserPropertyAssignment" DROP CONSTRAINT "UserPropertyAssignment_workspaceId_fkey";

-- AlterTable
ALTER TABLE "Broadcast" ALTER COLUMN "segmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserJourneyEvent" ALTER COLUMN "journeyId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProperty" ADD CONSTRAINT "UserProperty_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentAssignment" ADD CONSTRAINT "SegmentAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentAssignment" ADD CONSTRAINT "SegmentAssignment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPropertyAssignment" ADD CONSTRAINT "UserPropertyAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPropertyAssignment" ADD CONSTRAINT "UserPropertyAssignment_userPropertyId_fkey" FOREIGN KEY ("userPropertyId") REFERENCES "UserProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultEmailProvider" ADD CONSTRAINT "DefaultEmailProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultEmailProvider" ADD CONSTRAINT "DefaultEmailProvider_emailProviderId_fkey" FOREIGN KEY ("emailProviderId") REFERENCES "EmailProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentUserEventsTable" ADD CONSTRAINT "CurrentUserEventsTable_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailProvider" ADD CONSTRAINT "EmailProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentIOConfiguration" ADD CONSTRAINT "SegmentIOConfiguration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJourneyEvent" ADD CONSTRAINT "UserJourneyEvent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
