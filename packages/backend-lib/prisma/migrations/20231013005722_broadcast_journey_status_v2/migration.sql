/*
  Warnings:

  - The `status` column on the `Broadcast` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "DBBroadcastStatus" AS ENUM ('NotStarted', 'InProgress', 'Triggered');

-- AlterTable
ALTER TABLE "Broadcast" DROP COLUMN "status",
ADD COLUMN     "status" "DBBroadcastStatus" NOT NULL DEFAULT 'NotStarted';
