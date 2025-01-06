-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
CREATE TYPE "public"."ComputedPropertyType" AS ENUM('Segment', 'UserProperty');--> statement-breakpoint
CREATE TYPE "public"."DBBroadcastStatus" AS ENUM('NotStarted', 'InProgress', 'Triggered');--> statement-breakpoint
CREATE TYPE "public"."DBChannelType" AS ENUM('Email', 'MobilePush', 'Sms', 'Webhook');--> statement-breakpoint
CREATE TYPE "public"."DBCompletionStatus" AS ENUM('NotStarted', 'InProgress', 'Successful', 'Failed');--> statement-breakpoint
CREATE TYPE "public"."DBResourceType" AS ENUM('Declarative', 'Internal');--> statement-breakpoint
CREATE TYPE "public"."DBRoleType" AS ENUM('Admin', 'WorkspaceManager', 'Author', 'Viewer');--> statement-breakpoint
CREATE TYPE "public"."DBSubscriptionGroupType" AS ENUM('OptIn', 'OptOut');--> statement-breakpoint
CREATE TYPE "public"."JourneyStatus" AS ENUM('NotStarted', 'Running', 'Paused', 'Broadcast');--> statement-breakpoint
CREATE TYPE "public"."SegmentStatus" AS ENUM('NotStarted', 'Running', 'Paused');--> statement-breakpoint
CREATE TYPE "public"."WorkspaceStatus" AS ENUM('Active', 'Tombstoned');--> statement-breakpoint
CREATE TYPE "public"."WorkspaceType" AS ENUM('Root', 'Child', 'Parent');--> statement-breakpoint
CREATE TABLE "Workspace" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"domain" text,
	"type" "WorkspaceType" DEFAULT 'Root' NOT NULL,
	"externalId" text,
	"status" "WorkspaceStatus" DEFAULT 'Active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SegmentIOConfiguration" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"sharedSecret" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "UserProperty" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"resourceType" "DBResourceType" DEFAULT 'Declarative' NOT NULL,
	"definitionUpdatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"exampleValue" text
);
--> statement-breakpoint
CREATE TABLE "UserPropertyAssignment" (
	"userId" text NOT NULL,
	"userPropertyId" uuid NOT NULL,
	"value" text NOT NULL,
	"workspaceId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "EmailProvider" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"type" text NOT NULL,
	"apiKey" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"secretId" uuid
);
--> statement-breakpoint
CREATE TABLE "UserJourneyEvent" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"journeyId" uuid,
	"type" text NOT NULL,
	"journeyStartedAt" timestamp(3) NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"nodeId" text,
	"eventKey" text,
	"eventKeyName" text
);
--> statement-breakpoint
CREATE TABLE "EmailTemplate" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"from" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"replyTo" text
);
--> statement-breakpoint
CREATE TABLE "SubscriptionGroup" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "DBSubscriptionGroupType" NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"channel" "DBChannelType" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DefaultEmailProvider" (
	"workspaceId" uuid NOT NULL,
	"emailProviderId" uuid NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"fromAddress" text
);
--> statement-breakpoint
CREATE TABLE "Broadcast" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"segmentId" uuid,
	"name" text NOT NULL,
	"triggeredAt" timestamp(3),
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"journeyId" uuid,
	"messageTemplateId" uuid,
	"status" "DBBroadcastStatus" DEFAULT 'NotStarted' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "_prisma_migrations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"finished_at" timestamp with time zone,
	"migration_name" varchar(255) NOT NULL,
	"logs" text,
	"rolled_back_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_steps_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SegmentAssignment" (
	"userId" text NOT NULL,
	"inSegment" boolean NOT NULL,
	"workspaceId" uuid NOT NULL,
	"segmentId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WorkspaceMemberRole" (
	"workspaceId" uuid NOT NULL,
	"workspaceMemberId" uuid NOT NULL,
	"role" "DBRoleType" DEFAULT 'Viewer' NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Secret" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"value" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"configValue" jsonb
);
--> statement-breakpoint
CREATE TABLE "WorkspaceMembeAccount" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceMemberId" uuid NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MessageTemplate" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"resourceType" "DBResourceType" DEFAULT 'Declarative' NOT NULL,
	"draft" jsonb
);
--> statement-breakpoint
CREATE TABLE "Integration" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"definitionUpdatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WriteKey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"secretId" uuid NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "OauthToken" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"refreshToken" text NOT NULL,
	"accessToken" text NOT NULL,
	"expiresIn" integer NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WorkspaceMember" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"name" text,
	"nickname" text,
	"lastWorkspaceId" uuid
);
--> statement-breakpoint
CREATE TABLE "Segment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"resourceType" "DBResourceType" DEFAULT 'Declarative' NOT NULL,
	"subscriptionGroupId" uuid,
	"status" "SegmentStatus" DEFAULT 'Running' NOT NULL,
	"definitionUpdatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DefaultSmsProvider" (
	"workspaceId" uuid NOT NULL,
	"smsProviderId" uuid NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SmsProvider" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"secretId" uuid NOT NULL,
	"type" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Journey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "JourneyStatus" DEFAULT 'NotStarted' NOT NULL,
	"definition" jsonb,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"resourceType" "DBResourceType" DEFAULT 'Declarative' NOT NULL,
	"canRunMultiple" boolean DEFAULT false NOT NULL,
	"draft" jsonb,
	"statusUpdatedAt" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "ComputedPropertyPeriod" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"type" "ComputedPropertyType" NOT NULL,
	"computedPropertyId" uuid NOT NULL,
	"version" text NOT NULL,
	"from" timestamp(3),
	"to" timestamp(3) NOT NULL,
	"step" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AdminApiKey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"secretId" uuid NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Feature" (
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"config" jsonb
);
--> statement-breakpoint
CREATE TABLE "WorkspaceRelation" (
	"parentWorkspaceId" uuid NOT NULL,
	"childWorkspaceId" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "SegmentIOConfiguration" ADD CONSTRAINT "SegmentIOConfiguration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "UserProperty" ADD CONSTRAINT "UserProperty_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "UserPropertyAssignment" ADD CONSTRAINT "UserPropertyAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "UserPropertyAssignment" ADD CONSTRAINT "UserPropertyAssignment_userPropertyId_fkey" FOREIGN KEY ("userPropertyId") REFERENCES "public"."UserProperty"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "EmailProvider" ADD CONSTRAINT "EmailProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "EmailProvider" ADD CONSTRAINT "EmailProvider_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "public"."Secret"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SubscriptionGroup" ADD CONSTRAINT "SubscriptionGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DefaultEmailProvider" ADD CONSTRAINT "DefaultEmailProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DefaultEmailProvider" ADD CONSTRAINT "DefaultEmailProvider_emailProviderId_fkey" FOREIGN KEY ("emailProviderId") REFERENCES "public"."EmailProvider"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."Segment"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "public"."Journey"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_messageTemplateId_fkey" FOREIGN KEY ("messageTemplateId") REFERENCES "public"."MessageTemplate"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SegmentAssignment" ADD CONSTRAINT "SegmentAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SegmentAssignment" ADD CONSTRAINT "SegmentAssignment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."Segment"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "WorkspaceMemberRole" ADD CONSTRAINT "WorkspaceMemberRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "WorkspaceMemberRole" ADD CONSTRAINT "WorkspaceMemberRole_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."WorkspaceMember"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "WorkspaceMembeAccount" ADD CONSTRAINT "WorkspaceMembeAccount_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."WorkspaceMember"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "WriteKey" ADD CONSTRAINT "WriteKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "WriteKey" ADD CONSTRAINT "WriteKey_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "public"."Secret"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "OauthToken" ADD CONSTRAINT "OauthToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_lastWorkspaceId_fkey" FOREIGN KEY ("lastWorkspaceId") REFERENCES "public"."Workspace"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_subscriptionGroupId_fkey" FOREIGN KEY ("subscriptionGroupId") REFERENCES "public"."SubscriptionGroup"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DefaultSmsProvider" ADD CONSTRAINT "DefaultSmsProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DefaultSmsProvider" ADD CONSTRAINT "DefaultSmsProvider_smsProviderId_fkey" FOREIGN KEY ("smsProviderId") REFERENCES "public"."SmsProvider"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SmsProvider" ADD CONSTRAINT "SmsProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SmsProvider" ADD CONSTRAINT "SmsProvider_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "public"."Secret"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ComputedPropertyPeriod" ADD CONSTRAINT "ComputedPropertyPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AdminApiKey" ADD CONSTRAINT "AdminApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AdminApiKey" ADD CONSTRAINT "AdminApiKey_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "public"."Secret"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "WorkspaceRelation" ADD CONSTRAINT "WorkspaceRelation_parentWorkspaceId_fkey" FOREIGN KEY ("parentWorkspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "WorkspaceRelation" ADD CONSTRAINT "WorkspaceRelation_childWorkspaceId_fkey" FOREIGN KEY ("childWorkspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Workspace_externalId_key" ON "Workspace" USING btree ("externalId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Workspace_name_key" ON "Workspace" USING btree ("name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "SegmentIOConfiguration_workspaceId_key" ON "SegmentIOConfiguration" USING btree ("workspaceId" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "UserProperty_workspaceId_name_key" ON "UserProperty" USING btree ("workspaceId" uuid_ops,"name" text_ops);
CREATE INDEX "UserPropertyAssignment_userId_idx" ON "UserPropertyAssignment" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "UserPropertyAssignment_workspaceId_userPropertyId_userId_key" ON "UserPropertyAssignment" USING btree ("workspaceId" uuid_ops,"userPropertyId" uuid_ops,"userId" text_ops);
CREATE UNIQUE INDEX "EmailProvider_workspaceId_type_key" ON "EmailProvider" USING btree ("workspaceId" uuid_ops,"type" text_ops);
CREATE UNIQUE INDEX "UserJourneyEvent_journeyId_userId_eventKey_eventKeyName_typ_key" ON "UserJourneyEvent" USING btree ("journeyId" uuid_ops,"userId" text_ops,"eventKey" text_ops,"eventKeyName" text_ops,"type" text_ops,"journeyStartedAt" timestamp_ops,"nodeId" text_ops);
CREATE INDEX "SubscriptionGroup_workspaceId_idx" ON "SubscriptionGroup" USING btree ("workspaceId" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "SubscriptionGroup_workspaceId_name_key" ON "SubscriptionGroup" USING btree ("workspaceId" uuid_ops,"name" text_ops);
CREATE UNIQUE INDEX "DefaultEmailProvider_workspaceId_key" ON "DefaultEmailProvider" USING btree ("workspaceId" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Broadcast_workspaceId_name_key" ON "Broadcast" USING btree ("workspaceId" uuid_ops,"name" text_ops);
CREATE UNIQUE INDEX "SegmentAssignment_workspaceId_userId_segmentId_key" ON "SegmentAssignment" USING btree ("workspaceId" uuid_ops,"userId" text_ops,"segmentId" uuid_ops);
CREATE UNIQUE INDEX "WorkspaceMemberRole_workspaceId_workspaceMemberId_key" ON "WorkspaceMemberRole" USING btree ("workspaceId" uuid_ops,"workspaceMemberId" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Secret_workspaceId_name_key" ON "Secret" USING btree ("workspaceId" uuid_ops,"name" text_ops);
CREATE UNIQUE INDEX "WorkspaceMembeAccount_provider_providerAccountId_key" ON "WorkspaceMembeAccount" USING btree ("provider" text_ops,"providerAccountId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "MessageTemplate_workspaceId_name_key" ON "MessageTemplate" USING btree ("workspaceId" uuid_ops,"name" text_ops);
CREATE UNIQUE INDEX "Integration_workspaceId_name_key" ON "Integration" USING btree ("workspaceId" uuid_ops,"name" text_ops);
CREATE UNIQUE INDEX "WriteKey_workspaceId_secretId_key" ON "WriteKey" USING btree ("workspaceId" uuid_ops,"secretId" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "OauthToken_workspaceId_name_key" ON "Integration" USING btree ("workspaceId" uuid_ops,"name" text_ops);
CREATE UNIQUE INDEX "WorkspaceMember_email_key" ON "WorkspaceMember" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "Segment_resourceType_idx" ON "Segment" USING btree ("resourceType" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Segment_workspaceId_name_key" ON "Segment" USING btree ("workspaceId" uuid_ops,"name" text_ops);
CREATE UNIQUE INDEX "DefaultSmsProvider_workspaceId_key" ON "DefaultSmsProvider" USING btree ("workspaceId" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "SmsProvider_workspaceId_type_key" ON "SmsProvider" USING btree ("workspaceId" uuid_ops,"type" text_ops);
CREATE UNIQUE INDEX "Journey_workspaceId_name_key" ON "Journey" USING btree ("workspaceId" uuid_ops,"name" text_ops);
CREATE INDEX "ComputedPropertyPeriod_workspaceId_type_computedPropertyId__idx" ON "ComputedPropertyPeriod" USING btree ("workspaceId" uuid_ops, "type" enum_ops, "computedPropertyId" uuid_ops, "to" timestamp_ops);
CREATE UNIQUE INDEX "AdminApiKey_workspaceId_name_key" ON "AdminApiKey" USING btree ("workspaceId" uuid_ops,"name" text_ops);
CREATE UNIQUE INDEX "Feature_workspaceId_name_key" ON "Feature" USING btree ("workspaceId" uuid_ops,"name" text_ops);
CREATE UNIQUE INDEX "WorkspaceRelation_parentWorkspaceId_childWorkspaceId_key" ON "WorkspaceRelation" USING btree ("parentWorkspaceId" uuid_ops,"childWorkspaceId" uuid_ops);