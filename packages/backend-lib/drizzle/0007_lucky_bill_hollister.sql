CREATE TABLE "WorkspaceMemberSetting" (
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"workspaceMemberId" uuid NOT NULL,
	"config" jsonb,
	"secretId" uuid,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "WorkspaceMemberSetting" ADD CONSTRAINT "WorkspaceMemberSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "WorkspaceMemberSetting" ADD CONSTRAINT "WorkspaceMemberSetting_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."WorkspaceMember"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "WorkspaceMemberSetting" ADD CONSTRAINT "WorkspaceMemberSetting_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "public"."Secret"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "WorkspaceMemberSetting_workspaceId_workspaceMemberId_key" ON "WorkspaceMemberSetting" USING btree ("workspaceId" uuid_ops,"workspaceMemberId" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "WorkspaceMemberSetting_workspaceId_name_key" ON "WorkspaceMemberSetting" USING btree ("workspaceId" uuid_ops,"name" text_ops);