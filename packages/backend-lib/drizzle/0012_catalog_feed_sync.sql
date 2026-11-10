ALTER TABLE "Catalog" ADD COLUMN "sourceUrl" text;--> statement-breakpoint
ALTER TABLE "Catalog" ADD COLUMN "feedFormat" text;--> statement-breakpoint
ALTER TABLE "Catalog" ADD COLUMN "syncIntervalMinutes" integer DEFAULT 360 NOT NULL;--> statement-breakpoint
ALTER TABLE "Catalog" ADD COLUMN "syncEnabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "Catalog" ADD COLUMN "nextSyncAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "Catalog" ADD COLUMN "consecutiveFailures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "Catalog_syncEnabled_nextSyncAt_idx" ON "Catalog" USING btree ("syncEnabled" bool_ops,"nextSyncAt" timestamp_ops);