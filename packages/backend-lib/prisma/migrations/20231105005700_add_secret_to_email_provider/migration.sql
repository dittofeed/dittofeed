-- AlterTable
ALTER TABLE "EmailProvider" ADD COLUMN     "secretId" UUID,
ALTER COLUMN "apiKey" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "EmailProvider" ADD CONSTRAINT "EmailProvider_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "Secret"("id") ON DELETE CASCADE ON UPDATE CASCADE;
