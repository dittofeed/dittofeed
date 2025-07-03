DROP INDEX "WorkspaceOccupantSetting_workspaceId_workspaceOccupantId_key";--> statement-breakpoint
DROP INDEX "WorkspaceOccupantSetting_workspaceId_name_key";--> statement-breakpoint
CREATE UNIQUE INDEX "WorkspaceOccupantSetting_workspaceId_occupantId_name_key" ON "WorkspaceOccupantSetting" USING btree ("workspaceId" uuid_ops,"workspaceOccupantId" text_ops,"name" text_ops);