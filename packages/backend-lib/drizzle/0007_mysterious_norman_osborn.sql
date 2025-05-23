CREATE TYPE "public"."DBWorkspaceOccupantType" AS ENUM('WorkspaceMember', 'ChildWorkspaceOccupant');--> statement-breakpoint
CREATE TABLE "WorkspaceOccupantSetting" (
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"workspaceOccupantId" text NOT NULL,
	"occupantType" "DBWorkspaceOccupantType" NOT NULL,
	"config" jsonb,
	"secretId" uuid,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "WorkspaceOccupantSetting" ADD CONSTRAINT "WorkspaceOccupantSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "WorkspaceOccupantSetting" ADD CONSTRAINT "WorkspaceOccupantSetting_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "public"."Secret"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "WorkspaceOccupantSetting_workspaceId_workspaceOccupantId_key" ON "WorkspaceOccupantSetting" USING btree ("workspaceId" uuid_ops,"workspaceOccupantId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "WorkspaceOccupantSetting_workspaceId_name_key" ON "WorkspaceOccupantSetting" USING btree ("workspaceId" uuid_ops,"name" text_ops);