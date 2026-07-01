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
ALTER TABLE "RealtimeSegmentStatus" ADD CONSTRAINT "RealtimeSegmentStatus_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "RealtimeSegmentStatus" ADD CONSTRAINT "RealtimeSegmentStatus_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."Segment"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX "RealtimeSegmentStatus_workspaceId_segmentId_key" ON "RealtimeSegmentStatus" USING btree ("workspaceId" uuid_ops,"segmentId" uuid_ops);
--> statement-breakpoint
CREATE INDEX "RealtimeSegmentStatus_workspaceId_updatedAt_idx" ON "RealtimeSegmentStatus" USING btree ("workspaceId" uuid_ops,"updatedAt" timestamp_ops);
