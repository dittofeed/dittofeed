BEGIN;

DROP INDEX "Workspace_externalId_key";--> statement-breakpoint
DROP INDEX "Workspace_name_key";--> statement-breakpoint
ALTER TABLE "Workspace" ADD COLUMN "parentWorkspaceId" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "Workspace_parentWorkspaceId_externalId_key" ON "Workspace" USING btree ("parentWorkspaceId" uuid_ops,"externalId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Workspace_parentWorkspaceId_name_key" ON "Workspace" USING btree ("parentWorkspaceId" uuid_ops,"name" text_ops);

COMMIT;