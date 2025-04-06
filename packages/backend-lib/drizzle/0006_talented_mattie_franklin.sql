CREATE TYPE "public"."DBBroadcastStatusV2" AS ENUM('Draft', 'Scheduled', 'Running', 'Paused', 'Completed', 'Cancelled', 'Failed');--> statement-breakpoint
CREATE TYPE "public"."DBBroadcastVersion" AS ENUM('V1', 'V2');--> statement-breakpoint
CREATE TYPE "public"."UserPropertyStatus" AS ENUM('NotStarted', 'Running', 'Paused');--> statement-breakpoint
ALTER TABLE "Broadcast" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "subscriptionGroupId" uuid;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "statusV2" "DBBroadcastStatusV2" DEFAULT 'Draft';--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "scheduledAt" timestamp(3);--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "version" "DBBroadcastVersion" DEFAULT 'V1';--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "UserProperty" ADD COLUMN "status" "UserPropertyStatus" DEFAULT 'Running' NOT NULL;