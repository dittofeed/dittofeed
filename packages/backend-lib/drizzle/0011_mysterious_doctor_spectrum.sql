CREATE TABLE "DefaultMobilePushProvider" (
	"workspaceId" uuid NOT NULL,
	"mobilePushProviderId" uuid NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MobilePushProvider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"secretId" uuid NOT NULL,
	"type" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "DefaultMobilePushProvider" ADD CONSTRAINT "DefaultMobilePushProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DefaultMobilePushProvider" ADD CONSTRAINT "DefaultMobilePushProvider_mobilePushProviderId_fkey" FOREIGN KEY ("mobilePushProviderId") REFERENCES "public"."MobilePushProvider"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MobilePushProvider" ADD CONSTRAINT "MobilePushProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MobilePushProvider" ADD CONSTRAINT "MobilePushProvider_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "public"."Secret"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "DefaultMobilePushProvider_workspaceId_key" ON "DefaultMobilePushProvider" USING btree ("workspaceId" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "MobilePushProvider_workspaceId_type_key" ON "MobilePushProvider" USING btree ("workspaceId" uuid_ops,"type" text_ops);