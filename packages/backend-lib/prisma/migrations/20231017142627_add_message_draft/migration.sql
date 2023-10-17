-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "draft" JSONB,
ALTER COLUMN "definition" DROP NOT NULL;
