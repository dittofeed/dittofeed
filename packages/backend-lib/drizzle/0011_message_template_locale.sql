ALTER TABLE "MessageTemplate" ADD COLUMN "locale" text DEFAULT '' NOT NULL;--> statement-breakpoint
DROP INDEX "MessageTemplate_workspaceId_name_key";--> statement-breakpoint
CREATE UNIQUE INDEX "MessageTemplate_workspaceId_name_locale_key" ON "MessageTemplate" USING btree ("workspaceId" uuid_ops,"name" text_ops,"locale" text_ops);
