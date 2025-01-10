ALTER TABLE "WorkspaceMembeAccount" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "WorkspaceMembeAccount" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "WorkspaceMemberRole" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "WorkspaceMemberRole" ALTER COLUMN "updatedAt" SET DEFAULT now();