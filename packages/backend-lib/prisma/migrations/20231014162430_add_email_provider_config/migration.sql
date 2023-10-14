-- AlterTable
ALTER TABLE "EmailProvider" ADD COLUMN     "config" JSONB,
ADD COLUMN     "secretId" UUID,
ALTER COLUMN "apiKey" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "EmailProvider" ADD CONSTRAINT "EmailProvider_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "Secret"("id") ON DELETE SET NULL ON UPDATE CASCADE;
