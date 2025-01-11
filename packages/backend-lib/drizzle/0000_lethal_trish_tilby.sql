DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'computedpropertytype') THEN
        CREATE TYPE ComputedPropertyType AS ENUM ('Segment', 'UserProperty');
    END IF;
END $$ ;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dbbroadcaststatus') THEN
        CREATE TYPE DBBroadcastStatus AS ENUM ('NotStarted', 'InProgress', 'Triggered');
    END IF;
END $$ ;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dbchanneltype') THEN
        CREATE TYPE DBChannelType AS ENUM ('Email', 'MobilePush', 'Sms', 'Webhook');
    END IF;
END $$ ;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dbcompletionstatus') THEN
        CREATE TYPE DBCompletionStatus AS ENUM ('NotStarted', 'InProgress', 'Successful', 'Failed');
    END IF;
END $$ ;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dbresourcetype') THEN
        CREATE TYPE DBResourceType AS ENUM ('Declarative', 'Internal');
    END IF;
END $$ ;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dbroletype') THEN
        CREATE TYPE DBRoleType AS ENUM ('Admin', 'WorkspaceManager', 'Author', 'Viewer');
    END IF;
END $$ ;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dbsubscriptiongrouptype') THEN
        CREATE TYPE DBSubscriptionGroupType AS ENUM ('OptIn', 'OptOut');
    END IF;
END $$ ;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'journeystatus') THEN
        CREATE TYPE JourneyStatus AS ENUM ('NotStarted', 'Running', 'Paused', 'Broadcast');
    END IF;
END $$ ;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'segmentstatus') THEN
        CREATE TYPE SegmentStatus AS ENUM ('NotStarted', 'Running', 'Paused');
    END IF;
END $$ ;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workspacestatus') THEN
        CREATE TYPE WorkspaceStatus AS ENUM ('Active', 'Tombstoned');
    END IF;
END $$ ;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workspacetype') THEN
        CREATE TYPE WorkspaceType AS ENUM ('Root', 'Child', 'Parent');
    END IF;
END $$ ;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "AdminApiKey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"secretId" uuid NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Broadcast" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"segmentId" uuid,
	"name" text NOT NULL,
	"triggeredAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"journeyId" uuid,
	"messageTemplateId" uuid,
	"status" "DBBroadcastStatus" DEFAULT 'NotStarted' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ComputedPropertyPeriod" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"type" "ComputedPropertyType" NOT NULL,
	"computedPropertyId" uuid NOT NULL,
	"version" text NOT NULL,
	"from" timestamp (3),
	"to" timestamp (3) NOT NULL,
	"step" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "DefaultEmailProvider" (
	"workspaceId" uuid NOT NULL,
	"emailProviderId" uuid NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"fromAddress" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "DefaultSmsProvider" (
	"workspaceId" uuid NOT NULL,
	"smsProviderId" uuid NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EmailProvider" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"type" text NOT NULL,
	"apiKey" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"secretId" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EmailTemplate" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"from" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"replyTo" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Feature" (
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"config" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Integration" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"definitionUpdatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Journey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "JourneyStatus" DEFAULT 'NotStarted' NOT NULL,
	"definition" jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"resourceType" "DBResourceType" DEFAULT 'Declarative' NOT NULL,
	"canRunMultiple" boolean DEFAULT false NOT NULL,
	"draft" jsonb,
	"statusUpdatedAt" timestamp (3)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "MessageTemplate" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"resourceType" "DBResourceType" DEFAULT 'Declarative' NOT NULL,
	"draft" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OauthToken" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"refreshToken" text NOT NULL,
	"accessToken" text NOT NULL,
	"expiresIn" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Secret" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"value" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"configValue" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Segment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"resourceType" "DBResourceType" DEFAULT 'Declarative' NOT NULL,
	"subscriptionGroupId" uuid,
	"status" "SegmentStatus" DEFAULT 'Running' NOT NULL,
	"definitionUpdatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SegmentAssignment" (
	"userId" text NOT NULL,
	"inSegment" boolean NOT NULL,
	"workspaceId" uuid NOT NULL,
	"segmentId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SegmentIOConfiguration" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"sharedSecret" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SmsProvider" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"secretId" uuid NOT NULL,
	"type" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SubscriptionGroup" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "DBSubscriptionGroupType" NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"channel" "DBChannelType" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserJourneyEvent" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"journeyId" uuid,
	"type" text NOT NULL,
	"journeyStartedAt" timestamp (3) NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"nodeId" text,
	"eventKey" text,
	"eventKeyName" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserProperty" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"resourceType" "DBResourceType" DEFAULT 'Declarative' NOT NULL,
	"definitionUpdatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"exampleValue" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserPropertyAssignment" (
	"userId" text NOT NULL,
	"userPropertyId" uuid NOT NULL,
	"value" text NOT NULL,
	"workspaceId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Workspace" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"domain" text,
	"type" "WorkspaceType" DEFAULT 'Root' NOT NULL,
	"externalId" text,
	"status" "WorkspaceStatus" DEFAULT 'Active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "WorkspaceMembeAccount" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceMemberId" uuid NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"name" text,
	"nickname" text,
	"lastWorkspaceId" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "WorkspaceMemberRole" (
	"workspaceId" uuid NOT NULL,
	"workspaceMemberId" uuid NOT NULL,
	"role" "DBRoleType" DEFAULT 'Viewer' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "WorkspaceRelation" (
	"parentWorkspaceId" uuid NOT NULL,
	"childWorkspaceId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "WriteKey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"secretId" uuid NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminApiKey_workspaceId_fkey') THEN
        ALTER TABLE "AdminApiKey" ADD CONSTRAINT "AdminApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminApiKey_secretId_fkey') THEN
        ALTER TABLE "AdminApiKey" ADD CONSTRAINT "AdminApiKey_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "public"."Secret"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Broadcast_segmentId_fkey') THEN
        ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."Segment"("id") ON DELETE set null ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Broadcast_journeyId_fkey') THEN
        ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "public"."Journey"("id") ON DELETE set null ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Broadcast_workspaceId_fkey') THEN
        ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE restrict ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Broadcast_messageTemplateId_fkey') THEN
        ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_messageTemplateId_fkey" FOREIGN KEY ("messageTemplateId") REFERENCES "public"."MessageTemplate"("id") ON DELETE set null ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComputedPropertyPeriod_workspaceId_fkey') THEN
        ALTER TABLE "ComputedPropertyPeriod" ADD CONSTRAINT "ComputedPropertyPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DefaultEmailProvider_workspaceId_fkey') THEN
        ALTER TABLE "DefaultEmailProvider" ADD CONSTRAINT "DefaultEmailProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DefaultEmailProvider_emailProviderId_fkey') THEN
        ALTER TABLE "DefaultEmailProvider" ADD CONSTRAINT "DefaultEmailProvider_emailProviderId_fkey" FOREIGN KEY ("emailProviderId") REFERENCES "public"."EmailProvider"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DefaultSmsProvider_workspaceId_fkey') THEN
        ALTER TABLE "DefaultSmsProvider" ADD CONSTRAINT "DefaultSmsProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DefaultSmsProvider_smsProviderId_fkey') THEN
        ALTER TABLE "DefaultSmsProvider" ADD CONSTRAINT "DefaultSmsProvider_smsProviderId_fkey" FOREIGN KEY ("smsProviderId") REFERENCES "public"."SmsProvider"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailProvider_workspaceId_fkey') THEN
        ALTER TABLE "EmailProvider" ADD CONSTRAINT "EmailProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailProvider_secretId_fkey') THEN
        ALTER TABLE "EmailProvider" ADD CONSTRAINT "EmailProvider_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "public"."Secret"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailTemplate_workspaceId_fkey') THEN
        ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Feature_workspaceId_fkey') THEN
        ALTER TABLE "Feature" ADD CONSTRAINT "Feature_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Integration_workspaceId_fkey') THEN
        ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Journey_workspaceId_fkey') THEN
        ALTER TABLE "Journey" ADD CONSTRAINT "Journey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageTemplate_workspaceId_fkey') THEN
        ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OauthToken_workspaceId_fkey') THEN
        ALTER TABLE "OauthToken" ADD CONSTRAINT "OauthToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Secret_workspaceId_fkey') THEN
        ALTER TABLE "Secret" ADD CONSTRAINT "Secret_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Segment_workspaceId_fkey') THEN
        ALTER TABLE "Segment" ADD CONSTRAINT "Segment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Segment_subscriptionGroupId_fkey') THEN
        ALTER TABLE "Segment" ADD CONSTRAINT "Segment_subscriptionGroupId_fkey" FOREIGN KEY ("subscriptionGroupId") REFERENCES "public"."SubscriptionGroup"("id") ON DELETE set null ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SegmentAssignment_workspaceId_fkey') THEN
        ALTER TABLE "SegmentAssignment" ADD CONSTRAINT "SegmentAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SegmentAssignment_segmentId_fkey') THEN
        ALTER TABLE "SegmentAssignment" ADD CONSTRAINT "SegmentAssignment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."Segment"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SegmentIOConfiguration_workspaceId_fkey') THEN
        ALTER TABLE "SegmentIOConfiguration" ADD CONSTRAINT "SegmentIOConfiguration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SmsProvider_workspaceId_fkey') THEN
        ALTER TABLE "SmsProvider" ADD CONSTRAINT "SmsProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SmsProvider_secretId_fkey') THEN
        ALTER TABLE "SmsProvider" ADD CONSTRAINT "SmsProvider_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "public"."Secret"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionGroup_workspaceId_fkey') THEN
        ALTER TABLE "SubscriptionGroup" ADD CONSTRAINT "SubscriptionGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserProperty_workspaceId_fkey') THEN
        ALTER TABLE "UserProperty" ADD CONSTRAINT "UserProperty_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserPropertyAssignment_workspaceId_fkey') THEN
        ALTER TABLE "UserPropertyAssignment" ADD CONSTRAINT "UserPropertyAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserPropertyAssignment_userPropertyId_fkey') THEN
        ALTER TABLE "UserPropertyAssignment" ADD CONSTRAINT "UserPropertyAssignment_userPropertyId_fkey" FOREIGN KEY ("userPropertyId") REFERENCES "public"."UserProperty"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceMembeAccount_workspaceMemberId_fkey') THEN
        ALTER TABLE "WorkspaceMembeAccount" ADD CONSTRAINT "WorkspaceMembeAccount_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."WorkspaceMember"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceMember_lastWorkspaceId_fkey') THEN
        ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_lastWorkspaceId_fkey" FOREIGN KEY ("lastWorkspaceId") REFERENCES "public"."Workspace"("id") ON DELETE set null ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceMemberRole_workspaceId_fkey') THEN
        ALTER TABLE "WorkspaceMemberRole" ADD CONSTRAINT "WorkspaceMemberRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceMemberRole_workspaceMemberId_fkey') THEN
        ALTER TABLE "WorkspaceMemberRole" ADD CONSTRAINT "WorkspaceMemberRole_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."WorkspaceMember"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceRelation_parentWorkspaceId_fkey') THEN
        ALTER TABLE "WorkspaceRelation" ADD CONSTRAINT "WorkspaceRelation_parentWorkspaceId_fkey" FOREIGN KEY ("parentWorkspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceRelation_childWorkspaceId_fkey') THEN
        ALTER TABLE "WorkspaceRelation" ADD CONSTRAINT "WorkspaceRelation_childWorkspaceId_fkey" FOREIGN KEY ("childWorkspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WriteKey_workspaceId_fkey') THEN
        ALTER TABLE "WriteKey" ADD CONSTRAINT "WriteKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WriteKey_secretId_fkey') THEN
        ALTER TABLE "WriteKey" ADD CONSTRAINT "WriteKey_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "public"."Secret"("id") ON DELETE cascade ON UPDATE cascade;
    END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'AdminApiKey_workspaceId_name_key') THEN
        CREATE UNIQUE INDEX "AdminApiKey_workspaceId_name_key" ON "AdminApiKey" USING btree ("workspaceId" uuid_ops,"name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Broadcast_workspaceId_name_key') THEN
        CREATE UNIQUE INDEX "Broadcast_workspaceId_name_key" ON "Broadcast" USING btree ("workspaceId" uuid_ops,"name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ComputedPropertyPeriod_workspaceId_type_computedPropertyId__idx') THEN
        CREATE INDEX "ComputedPropertyPeriod_workspaceId_type_computedPropertyId__idx" ON "ComputedPropertyPeriod" USING btree ("workspaceId" uuid_ops,"type" enum_ops,"computedPropertyId" uuid_ops,"to" timestamp_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'DefaultEmailProvider_workspaceId_key') THEN
        CREATE UNIQUE INDEX "DefaultEmailProvider_workspaceId_key" ON "DefaultEmailProvider" USING btree ("workspaceId" uuid_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'DefaultSmsProvider_workspaceId_key') THEN
        CREATE UNIQUE INDEX "DefaultSmsProvider_workspaceId_key" ON "DefaultSmsProvider" USING btree ("workspaceId" uuid_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'EmailProvider_workspaceId_type_key') THEN
        CREATE UNIQUE INDEX "EmailProvider_workspaceId_type_key" ON "EmailProvider" USING btree ("workspaceId" uuid_ops,"type" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Feature_workspaceId_name_key') THEN
        CREATE UNIQUE INDEX "Feature_workspaceId_name_key" ON "Feature" USING btree ("workspaceId" uuid_ops,"name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Integration_workspaceId_name_key') THEN
        CREATE UNIQUE INDEX "Integration_workspaceId_name_key" ON "Integration" USING btree ("workspaceId" uuid_ops,"name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Journey_workspaceId_name_key') THEN
        CREATE UNIQUE INDEX "Journey_workspaceId_name_key" ON "Journey" USING btree ("workspaceId" uuid_ops,"name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'MessageTemplate_workspaceId_name_key') THEN
        CREATE UNIQUE INDEX "MessageTemplate_workspaceId_name_key" ON "MessageTemplate" USING btree ("workspaceId" uuid_ops,"name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'OauthToken_workspaceId_name_key') THEN
        CREATE UNIQUE INDEX "OauthToken_workspaceId_name_key" ON "OauthToken" USING btree ("workspaceId" uuid_ops,"name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Secret_workspaceId_name_key') THEN
        CREATE UNIQUE INDEX "Secret_workspaceId_name_key" ON "Secret" USING btree ("workspaceId" uuid_ops,"name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Segment_resourceType_idx') THEN
        CREATE INDEX "Segment_resourceType_idx" ON "Segment" USING btree ("resourceType" enum_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Segment_workspaceId_name_key') THEN
        CREATE UNIQUE INDEX "Segment_workspaceId_name_key" ON "Segment" USING btree ("workspaceId" uuid_ops,"name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'SegmentAssignment_workspaceId_userId_segmentId_key') THEN
        CREATE UNIQUE INDEX "SegmentAssignment_workspaceId_userId_segmentId_key" ON "SegmentAssignment" USING btree ("workspaceId" uuid_ops,"userId" text_ops,"segmentId" uuid_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'SegmentIOConfiguration_workspaceId_key') THEN
        CREATE UNIQUE INDEX "SegmentIOConfiguration_workspaceId_key" ON "SegmentIOConfiguration" USING btree ("workspaceId" uuid_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'SmsProvider_workspaceId_type_key') THEN
        CREATE UNIQUE INDEX "SmsProvider_workspaceId_type_key" ON "SmsProvider" USING btree ("workspaceId" uuid_ops,"type" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'SubscriptionGroup_workspaceId_idx') THEN
        CREATE INDEX "SubscriptionGroup_workspaceId_idx" ON "SubscriptionGroup" USING btree ("workspaceId" uuid_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'SubscriptionGroup_workspaceId_name_key') THEN
        CREATE UNIQUE INDEX "SubscriptionGroup_workspaceId_name_key" ON "SubscriptionGroup" USING btree ("workspaceId" uuid_ops,"name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'UserJourneyEvent_journeyId_userId_eventKey_eventKeyName_typ_key') THEN
        CREATE UNIQUE INDEX "UserJourneyEvent_journeyId_userId_eventKey_eventKeyName_typ_key" ON "UserJourneyEvent" USING btree ("journeyId" uuid_ops,"userId" text_ops,"eventKey" text_ops,"eventKeyName" text_ops,"type" text_ops,"journeyStartedAt" timestamp_ops,"nodeId" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'UserProperty_workspaceId_name_key') THEN
        CREATE UNIQUE INDEX "UserProperty_workspaceId_name_key" ON "UserProperty" USING btree ("workspaceId" uuid_ops,"name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'UserPropertyAssignment_userId_idx') THEN
        CREATE INDEX "UserPropertyAssignment_userId_idx" ON "UserPropertyAssignment" USING btree ("userId" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'UserPropertyAssignment_workspaceId_userPropertyId_userId_key') THEN
        CREATE UNIQUE INDEX "UserPropertyAssignment_workspaceId_userPropertyId_userId_key" ON "UserPropertyAssignment" USING btree ("workspaceId" uuid_ops,"userPropertyId" uuid_ops,"userId" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Workspace_externalId_key') THEN
        CREATE UNIQUE INDEX "Workspace_externalId_key" ON "Workspace" USING btree ("externalId" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Workspace_name_key') THEN
        CREATE UNIQUE INDEX "Workspace_name_key" ON "Workspace" USING btree ("name" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'WorkspaceMembeAccount_provider_providerAccountId_key') THEN
        CREATE UNIQUE INDEX "WorkspaceMembeAccount_provider_providerAccountId_key" ON "WorkspaceMembeAccount" USING btree ("provider" text_ops,"providerAccountId" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'WorkspaceMember_email_key') THEN
        CREATE UNIQUE INDEX "WorkspaceMember_email_key" ON "WorkspaceMember" USING btree ("email" text_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'WorkspaceMemberRole_workspaceId_workspaceMemberId_key') THEN
        CREATE UNIQUE INDEX "WorkspaceMemberRole_workspaceId_workspaceMemberId_key" ON "WorkspaceMemberRole" USING btree ("workspaceId" uuid_ops,"workspaceMemberId" uuid_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'WorkspaceRelation_parentWorkspaceId_childWorkspaceId_key') THEN
        CREATE UNIQUE INDEX "WorkspaceRelation_parentWorkspaceId_childWorkspaceId_key" ON "WorkspaceRelation" USING btree ("parentWorkspaceId" uuid_ops,"childWorkspaceId" uuid_ops);
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'WriteKey_workspaceId_secretId_key') THEN
        CREATE UNIQUE INDEX "WriteKey_workspaceId_secretId_key" ON "WriteKey" USING btree ("workspaceId" uuid_ops,"secretId" uuid_ops);
    END IF;
END $$;--> statement-breakpoint