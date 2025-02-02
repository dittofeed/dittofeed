DROP INDEX "Workspace_parentWorkspaceId_externalId_key";--> statement-breakpoint
DROP INDEX "Workspace_parentWorkspaceId_name_key";--> statement-breakpoint
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_parentWorkspaceId_externalId_key" UNIQUE("parentWorkspaceId","externalId");--> statement-breakpoint
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_parentWorkspaceId_name_key" UNIQUE NULLS NOT DISTINCT("parentWorkspaceId","name");