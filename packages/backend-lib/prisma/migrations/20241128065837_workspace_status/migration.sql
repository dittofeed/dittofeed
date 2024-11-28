-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('Active', 'Tombstoned');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "status" "WorkspaceStatus" NOT NULL DEFAULT 'Active';
