ALTER TABLE "SegmentIOConfiguration" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "SegmentIOConfiguration" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "WorkspaceMember" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "WorkspaceMember" ALTER COLUMN "updatedAt" SET DEFAULT now();