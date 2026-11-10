CREATE TABLE "Catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
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
	"attributes" jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Catalog" ADD CONSTRAINT "Catalog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CatalogCollection" ADD CONSTRAINT "CatalogCollection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CatalogCollection" ADD CONSTRAINT "CatalogCollection_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "public"."Catalog"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "public"."Catalog"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Catalog_workspaceId_name_key" ON "Catalog" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "CatalogCollection_workspaceId_name_key" ON "CatalogCollection" USING btree ("workspaceId" uuid_ops,"name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "CatalogItem_catalogId_itemId_key" ON "CatalogItem" USING btree ("catalogId" uuid_ops,"itemId" text_ops);--> statement-breakpoint
CREATE INDEX "CatalogItem_workspaceId_idx" ON "CatalogItem" USING btree ("workspaceId" uuid_ops);