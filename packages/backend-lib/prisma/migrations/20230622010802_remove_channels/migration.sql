/*
  Warnings:

  - You are about to drop the column `channelId` on the `SubscriptionGroup` table. All the data in the column will be lost.
  - You are about to drop the `Channel` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Channel" DROP CONSTRAINT "Channel_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "SubscriptionGroup" DROP CONSTRAINT "SubscriptionGroup_channelId_fkey";

-- AlterTable
ALTER TABLE "SubscriptionGroup" DROP COLUMN "channelId";

-- DropTable
DROP TABLE "Channel";
