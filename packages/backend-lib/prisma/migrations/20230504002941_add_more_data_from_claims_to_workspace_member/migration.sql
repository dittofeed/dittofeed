-- AlterTable
ALTER TABLE "WorkspaceMember" ADD COLUMN     "name" TEXT,
ADD COLUMN     "nickname" TEXT,
ALTER COLUMN "emailVerified" SET DEFAULT false;
