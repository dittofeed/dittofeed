CREATE TABLE "RealtimeSegmentDelayedEval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"segmentId" uuid NOT NULL,
	"userId" text,
	"anonymousId" text,
	"userOrAnonymousId" text NOT NULL,
	"event" text NOT NULL,
	"eventTime" timestamp (3) NOT NULL,
	"availableAt" timestamp (3) NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lockedAt" timestamp (3),
	"lockId" text,
	"lastError" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "RealtimeSegmentDelayedEval" ADD CONSTRAINT "RealtimeSegmentDelayedEval_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "RealtimeSegmentDelayedEval" ADD CONSTRAINT "RealtimeSegmentDelayedEval_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."Segment"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX "RealtimeSegmentDelayedEval_workspace_segment_user_available_key" ON "RealtimeSegmentDelayedEval" USING btree ("workspaceId" uuid_ops,"segmentId" uuid_ops,"userOrAnonymousId" text_ops,"availableAt" timestamp_ops);
--> statement-breakpoint
CREATE INDEX "RealtimeSegmentDelayedEval_status_availableAt_idx" ON "RealtimeSegmentDelayedEval" USING btree ("status" text_ops,"availableAt" timestamp_ops);
--> statement-breakpoint
CREATE INDEX "RealtimeSegmentDelayedEval_workspace_user_idx" ON "RealtimeSegmentDelayedEval" USING btree ("workspaceId" uuid_ops,"userOrAnonymousId" text_ops);
