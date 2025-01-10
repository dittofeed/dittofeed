ALTER TABLE "_prisma_migrations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "_prisma_migrations" CASCADE;--> statement-breakpoint
DROP INDEX "UserProperty_workspaceId_name_key";--> statement-breakpoint
DROP INDEX "UserPropertyAssignment_workspaceId_userPropertyId_userId_key";--> statement-breakpoint
DROP INDEX "EmailProvider_workspaceId_type_key";--> statement-breakpoint
DROP INDEX "UserJourneyEvent_journeyId_userId_eventKey_eventKeyName_typ_key";--> statement-breakpoint
DROP INDEX "SubscriptionGroup_workspaceId_name_key";--> statement-breakpoint
DROP INDEX "Broadcast_workspaceId_name_key";--> statement-breakpoint
DROP INDEX "SegmentAssignment_workspaceId_userId_segmentId_key";--> statement-breakpoint
DROP INDEX "Secret_workspaceId_name_key";--> statement-breakpoint
DROP INDEX "MessageTemplate_workspaceId_name_key";--> statement-breakpoint
DROP INDEX "Integration_workspaceId_name_key";--> statement-breakpoint
DROP INDEX "OauthToken_workspaceId_name_key";--> statement-breakpoint
DROP INDEX "Segment_workspaceId_name_key";--> statement-breakpoint
DROP INDEX "SmsProvider_workspaceId_type_key";--> statement-breakpoint
DROP INDEX "Journey_workspaceId_name_key";--> statement-breakpoint
DROP INDEX "ComputedPropertyPeriod_workspaceId_type_computedPropertyId__idx";--> statement-breakpoint
DROP INDEX "AdminApiKey_workspaceId_name_key";--> statement-breakpoint
DROP INDEX "Feature_workspaceId_name_key";--> statement-breakpoint
ALTER TABLE "Workspace" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "SegmentIOConfiguration" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "UserProperty" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "EmailProvider" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "UserJourneyEvent" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "EmailTemplate" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "SubscriptionGroup" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "Broadcast" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "Secret" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "WorkspaceMembeAccount" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "MessageTemplate" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "Integration" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "WriteKey" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "OauthToken" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "WorkspaceMember" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "Segment" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "SmsProvider" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "Journey" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "ComputedPropertyPeriod" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "AdminApiKey" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
CREATE UNIQUE INDEX "UserProperty_workspaceId_name_key" ON "UserProperty" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "UserPropertyAssignment_workspaceId_userPropertyId_userId_key" ON "UserPropertyAssignment" USING btree ("workspaceId" uuid_ops,"userPropertyId" uuid_ops,"userId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "EmailProvider_workspaceId_type_key" ON "EmailProvider" USING btree ("workspaceId" uuid_ops,"type" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "UserJourneyEvent_journeyId_userId_eventKey_eventKeyName_typ_key" ON "UserJourneyEvent" USING btree ("journeyId" uuid_ops,"userId" text_ops,"eventKey" text_ops,"eventKeyName" text_ops,"type" text_ops,"journeyStartedAt" timestamp_ops,"nodeId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "SubscriptionGroup_workspaceId_name_key" ON "SubscriptionGroup" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Broadcast_workspaceId_name_key" ON "Broadcast" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "SegmentAssignment_workspaceId_userId_segmentId_key" ON "SegmentAssignment" USING btree ("workspaceId" uuid_ops,"userId" text_ops,"segmentId" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Secret_workspaceId_name_key" ON "Secret" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "MessageTemplate_workspaceId_name_key" ON "MessageTemplate" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Integration_workspaceId_name_key" ON "Integration" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "OauthToken_workspaceId_name_key" ON "OauthToken" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Segment_workspaceId_name_key" ON "Segment" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "SmsProvider_workspaceId_type_key" ON "SmsProvider" USING btree ("workspaceId" uuid_ops,"type" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Journey_workspaceId_name_key" ON "Journey" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE INDEX "ComputedPropertyPeriod_workspaceId_type_computedPropertyId__idx" ON "ComputedPropertyPeriod" USING btree ("workspaceId" uuid_ops,"type" enum_ops,"computedPropertyId" uuid_ops,"to" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "AdminApiKey_workspaceId_name_key" ON "AdminApiKey" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Feature_workspaceId_name_key" ON "Feature" USING btree ("workspaceId" uuid_ops,"name" text_ops);