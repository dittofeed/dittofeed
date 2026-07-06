CREATE TYPE "public"."RealtimeSegmentEvalJobType" AS ENUM('segmentChange', 'eventReceived');--> statement-breakpoint
CREATE TABLE "RealtimeSegmentEvalJob" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid,
	"messageId" text NOT NULL,
	"userId" text,
	"anonymousId" text,
	"userOrAnonymousId" text NOT NULL,
	"eventType" text,
	"event" text,
	"traitPaths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"propertyPaths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"eventTime" timestamp (3) NOT NULL,
	"processingTime" timestamp (3) DEFAULT now() NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"availableAt" timestamp (3) DEFAULT now() NOT NULL,
	"lockedAt" timestamp (3),
	"lockId" text,
	"lastError" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"type" "RealtimeSegmentEvalJobType" DEFAULT 'eventReceived',
	"segment" text
);
--> statement-breakpoint
CREATE TABLE "RealtimeSegmentMembership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"segmentId" uuid NOT NULL,
	"userId" text NOT NULL,
	"inSegment" boolean NOT NULL,
	"eventTime" timestamp (3) NOT NULL,
	"assignedAt" timestamp (3) NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RealtimeSegmentStatus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"segmentId" uuid NOT NULL,
	"mode" text NOT NULL,
	"lastEvaluatedAt" timestamp (3),
	"lastAssignmentAt" timestamp (3),
	"lastTriggeredAt" timestamp (3),
	"evaluatedCount" integer DEFAULT 0 NOT NULL,
	"assignmentCount" integer DEFAULT 0 NOT NULL,
	"triggeredJourneyCount" integer DEFAULT 0 NOT NULL,
	"unsupportedCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Journey" ADD COLUMN "journeyType" text DEFAULT 'Marketing' NOT NULL;--> statement-breakpoint
ALTER TABLE "RealtimeSegmentEvalJob" ADD CONSTRAINT "RealtimeSegmentEvalJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "RealtimeSegmentMembership" ADD CONSTRAINT "RealtimeSegmentMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "RealtimeSegmentMembership" ADD CONSTRAINT "RealtimeSegmentMembership_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."Segment"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "RealtimeSegmentStatus" ADD CONSTRAINT "RealtimeSegmentStatus_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "RealtimeSegmentStatus" ADD CONSTRAINT "RealtimeSegmentStatus_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."Segment"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "RealtimeSegmentEvalJob_workspaceId_messageId_key" ON "RealtimeSegmentEvalJob" USING btree ("workspaceId" uuid_ops,"messageId" text_ops);--> statement-breakpoint
CREATE INDEX "RealtimeSegmentEvalJob_status_availableAt_idx" ON "RealtimeSegmentEvalJob" USING btree ("status" text_ops,"availableAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "RealtimeSegmentEvalJob_workspaceId_userOrAnonymousId_idx" ON "RealtimeSegmentEvalJob" USING btree ("workspaceId" uuid_ops,"userOrAnonymousId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "RealtimeSegmentMembership_workspace_segment_user_key" ON "RealtimeSegmentMembership" USING btree ("workspaceId" uuid_ops,"segmentId" uuid_ops,"userId" text_ops);--> statement-breakpoint
CREATE INDEX "RealtimeSegmentMembership_workspace_user_idx" ON "RealtimeSegmentMembership" USING btree ("workspaceId" uuid_ops,"userId" text_ops);--> statement-breakpoint
CREATE INDEX "RealtimeSegmentMembership_workspace_segment_idx" ON "RealtimeSegmentMembership" USING btree ("workspaceId" uuid_ops,"segmentId" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "RealtimeSegmentStatus_workspaceId_segmentId_key" ON "RealtimeSegmentStatus" USING btree ("workspaceId" uuid_ops,"segmentId" uuid_ops);--> statement-breakpoint
CREATE INDEX "RealtimeSegmentStatus_workspaceId_updatedAt_idx" ON "RealtimeSegmentStatus" USING btree ("workspaceId" uuid_ops,"updatedAt" timestamp_ops);