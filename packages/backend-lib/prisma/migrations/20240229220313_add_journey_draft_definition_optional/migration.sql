-- AlterTable
ALTER TABLE "Journey" ADD COLUMN     "draft" JSONB,
ALTER COLUMN "definition" DROP NOT NULL;
