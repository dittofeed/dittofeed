CREATE TABLE "CatalogItemInterest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"catalogId" uuid NOT NULL,
	"userId" text NOT NULL,
	"itemId" text NOT NULL,
	"kind" text NOT NULL,
	"eventCount" integer DEFAULT 1 NOT NULL,
	"lastEventAt" timestamp (3) DEFAULT now() NOT NULL,
	"notifiedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "CatalogItemInterest" ADD CONSTRAINT "CatalogItemInterest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CatalogItemInterest" ADD CONSTRAINT "CatalogItemInterest_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "public"."Catalog"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "CatalogItemInterest_catalogId_userId_itemId_kind_key" ON "CatalogItemInterest" USING btree ("catalogId" uuid_ops,"userId" text_ops,"itemId" text_ops,"kind" text_ops);--> statement-breakpoint
CREATE INDEX "CatalogItemInterest_catalogId_itemId_kind_idx" ON "CatalogItemInterest" USING btree ("catalogId" uuid_ops,"itemId" text_ops,"kind" text_ops);--> statement-breakpoint
CREATE INDEX "CatalogItemInterest_catalogId_userId_idx" ON "CatalogItemInterest" USING btree ("catalogId" uuid_ops,"userId" text_ops);