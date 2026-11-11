CREATE TYPE "public"."PiiCategory" AS ENUM('Email', 'Phone', 'Name', 'Address', 'GovernmentId', 'Financial', 'DateOfBirth', 'IpAddress', 'DeviceId', 'Other');--> statement-breakpoint
CREATE TYPE "public"."PiiFieldScope" AS ENUM('UserProperty', 'EventProperty', 'Column');--> statement-breakpoint
CREATE TABLE "PiiAccessAudit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"workspaceMemberId" uuid,
	"action" text NOT NULL,
	"scope" "PiiFieldScope" NOT NULL,
	"fieldName" text NOT NULL,
	"resourceIds" jsonb NOT NULL,
	"recordCount" integer NOT NULL,
	"filter" jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PiiField" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"scope" "PiiFieldScope" NOT NULL,
	"name" text NOT NULL,
	"category" "PiiCategory" DEFAULT 'Other' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "WorkspaceMemberRole" ADD COLUMN "unmaskPii" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "PiiAccessAudit" ADD CONSTRAINT "PiiAccessAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PiiAccessAudit" ADD CONSTRAINT "PiiAccessAudit_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."WorkspaceMember"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PiiField" ADD CONSTRAINT "PiiField_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "PiiAccessAudit_workspaceId_createdAt_idx" ON "PiiAccessAudit" USING btree ("workspaceId" uuid_ops,"createdAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "PiiAccessAudit_workspaceMemberId_idx" ON "PiiAccessAudit" USING btree ("workspaceMemberId" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "PiiField_workspaceId_scope_name_key" ON "PiiField" USING btree ("workspaceId" uuid_ops,"scope" enum_ops,"name" text_ops);