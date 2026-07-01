CREATE TABLE "RealtimeSegmentEvalJob" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"messageId" text NOT NULL,
	"userId" text,
	"anonymousId" text,
	"userOrAnonymousId" text NOT NULL,
	"eventType" text NOT NULL,
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
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "RealtimeSegmentEvalJob" ADD CONSTRAINT "RealtimeSegmentEvalJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX "RealtimeSegmentEvalJob_workspaceId_messageId_key" ON "RealtimeSegmentEvalJob" USING btree ("workspaceId" uuid_ops,"messageId" text_ops);
--> statement-breakpoint
CREATE INDEX "RealtimeSegmentEvalJob_status_availableAt_idx" ON "RealtimeSegmentEvalJob" USING btree ("status" text_ops,"availableAt" timestamp_ops);
--> statement-breakpoint
CREATE INDEX "RealtimeSegmentEvalJob_workspaceId_userOrAnonymousId_idx" ON "RealtimeSegmentEvalJob" USING btree ("workspaceId" uuid_ops,"userOrAnonymousId" text_ops);
