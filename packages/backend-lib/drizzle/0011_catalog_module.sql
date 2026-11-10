CREATE TABLE "Catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"sourceType" text DEFAULT 'api' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"locale" text,
	"syncStatus" text DEFAULT 'never' NOT NULL,
	"lastSyncedAt" timestamp (3),
	"lastPriceSyncedAt" timestamp (3),
	"lastInventorySyncedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CatalogCollection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"catalogId" uuid NOT NULL,
	"definition" jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CatalogItem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"catalogId" uuid NOT NULL,
	"itemId" text NOT NULL,
	"itemType" text DEFAULT 'product' NOT NULL,
	"parentItemId" text,
	"title" text,
	"description" text,
	"url" text,
	"imageUrl" text,
	"brand" text,
	"price" numeric(14, 4),
	"compareAtPrice" numeric(14, 4),
	"currency" text,
	"inventoryQuantity" integer,
	"inventoryPolicy" text,
	"inStock" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"categories" text[],
	"tags" text[],
	"priceMin" numeric(14, 4),
	"priceMax" numeric(14, 4),
	"inventoryTotal" integer,
	"variantCount" integer,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"syncId" text,
	"lastSeenAt" timestamp (3),
	"deletedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CatalogSyncRun" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"catalogId" uuid NOT NULL,
	"kind" text NOT NULL,
	"syncId" text,
	"status" text DEFAULT 'running' NOT NULL,
	"upsertedCount" integer DEFAULT 0 NOT NULL,
	"deletedCount" integer DEFAULT 0 NOT NULL,
	"skippedCount" integer DEFAULT 0 NOT NULL,
	"error" text,
	"startedAt" timestamp (3) DEFAULT now() NOT NULL,
	"finishedAt" timestamp (3)
);
--> statement-breakpoint
ALTER TABLE "Catalog" ADD CONSTRAINT "Catalog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CatalogCollection" ADD CONSTRAINT "CatalogCollection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CatalogCollection" ADD CONSTRAINT "CatalogCollection_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "public"."Catalog"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "public"."Catalog"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CatalogSyncRun" ADD CONSTRAINT "CatalogSyncRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CatalogSyncRun" ADD CONSTRAINT "CatalogSyncRun_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "public"."Catalog"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Catalog_workspaceId_name_key" ON "Catalog" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "CatalogCollection_workspaceId_name_key" ON "CatalogCollection" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "CatalogItem_catalogId_itemId_key" ON "CatalogItem" USING btree ("catalogId" uuid_ops,"itemId" text_ops);--> statement-breakpoint
CREATE INDEX "CatalogItem_workspaceId_idx" ON "CatalogItem" USING btree ("workspaceId" uuid_ops);--> statement-breakpoint
CREATE INDEX "CatalogItem_attributes_idx" ON "CatalogItem" USING gin ("attributes");--> statement-breakpoint
CREATE INDEX "CatalogItem_catalogId_syncId_idx" ON "CatalogItem" USING btree ("catalogId" uuid_ops,"syncId" text_ops);--> statement-breakpoint
CREATE INDEX "CatalogItem_catalogId_status_price_idx" ON "CatalogItem" USING btree ("catalogId" uuid_ops,"status" text_ops,"price" numeric_ops);--> statement-breakpoint
CREATE INDEX "CatalogItem_catalogId_parentItemId_idx" ON "CatalogItem" USING btree ("catalogId" uuid_ops,"parentItemId" text_ops);--> statement-breakpoint
CREATE INDEX "CatalogSyncRun_catalogId_startedAt_idx" ON "CatalogSyncRun" USING btree ("catalogId" uuid_ops,"startedAt" timestamp_ops);