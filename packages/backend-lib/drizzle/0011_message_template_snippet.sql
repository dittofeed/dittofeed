CREATE TABLE "MessageTemplateSnippet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"body" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "MessageTemplateSnippet" ADD CONSTRAINT "MessageTemplateSnippet_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "MessageTemplateSnippet_workspaceId_name_key" ON "MessageTemplateSnippet" USING btree ("workspaceId" uuid_ops,"name" text_ops);
