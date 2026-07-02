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
ALTER TABLE "RealtimeSegmentMembership" ADD CONSTRAINT "RealtimeSegmentMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "RealtimeSegmentMembership" ADD CONSTRAINT "RealtimeSegmentMembership_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."Segment"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX "RealtimeSegmentMembership_workspace_segment_user_key" ON "RealtimeSegmentMembership" USING btree ("workspaceId" uuid_ops,"segmentId" uuid_ops,"userId" text_ops);
--> statement-breakpoint
CREATE INDEX "RealtimeSegmentMembership_workspace_user_idx" ON "RealtimeSegmentMembership" USING btree ("workspaceId" uuid_ops,"userId" text_ops);
--> statement-breakpoint
CREATE INDEX "RealtimeSegmentMembership_workspace_segment_idx" ON "RealtimeSegmentMembership" USING btree ("workspaceId" uuid_ops,"segmentId" uuid_ops);
