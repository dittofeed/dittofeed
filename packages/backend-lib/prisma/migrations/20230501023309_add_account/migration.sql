/*
  Warnings:

  - You are about to drop the column `externalId` on the `WorkspaceMember` table. All the data in the column will be lost.
  - Added the required column `emailVerified` to the `WorkspaceMember` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "WorkspaceMember_externalId_key";

-- AlterTable
ALTER TABLE "WorkspaceMember" DROP COLUMN "externalId",
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL,
ADD COLUMN     "image" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WorkspaceMembeAccount" (
    "id" UUID NOT NULL,
    "workspaceMemberId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMembeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMembeAccount_provider_providerAccountId_key" ON "WorkspaceMembeAccount"("provider", "providerAccountId");

-- AddForeignKey
ALTER TABLE "WorkspaceMembeAccount" ADD CONSTRAINT "WorkspaceMembeAccount_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
