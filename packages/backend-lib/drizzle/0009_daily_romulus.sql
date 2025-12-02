CREATE TYPE "public"."DBUserPropertyIndexType" AS ENUM('String', 'Number', 'Date');--> statement-breakpoint
CREATE TABLE "UserPropertyIndex" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"userPropertyId" uuid NOT NULL,
	"type" "DBUserPropertyIndexType" NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "UserPropertyIndex" ADD CONSTRAINT "UserPropertyIndex_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "UserPropertyIndex" ADD CONSTRAINT "UserPropertyIndex_userPropertyId_fkey" FOREIGN KEY ("userPropertyId") REFERENCES "public"."UserProperty"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "UserPropertyIndex_userPropertyId_key" ON "UserPropertyIndex" USING btree ("userPropertyId" uuid_ops);