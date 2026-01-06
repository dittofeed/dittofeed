CREATE TABLE "SubscriptionManagementTemplate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"template" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "SubscriptionManagementTemplate" ADD CONSTRAINT "SubscriptionManagementTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "SubscriptionManagementTemplate_workspaceId_key" ON "SubscriptionManagementTemplate" USING btree ("workspaceId" uuid_ops);