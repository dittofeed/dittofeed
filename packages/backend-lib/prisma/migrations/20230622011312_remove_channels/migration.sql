/*
  Warnings:

  - You are about to drop the column `channelId` on the `SubscriptionGroup` table. All the data in the column will be lost.
  - You are about to drop the `Channel` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `channel` to the `SubscriptionGroup` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DBChannelType" AS ENUM ('Email', 'MobilePush');

-- DropForeignKey
ALTER TABLE "Channel" DROP CONSTRAINT "Channel_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "SubscriptionGroup" DROP CONSTRAINT "SubscriptionGroup_channelId_fkey";

-- AlterTable
ALTER TABLE "SubscriptionGroup" DROP COLUMN "channelId",
ADD COLUMN     "channel" "DBChannelType";

-- Set the value of all 'channel' rows to 'Email'
UPDATE "SubscriptionGroup"
SET "channel" = 'Email';

-- Now that all rows have a value, we can make 'channel' non-nullable
ALTER TABLE "SubscriptionGroup"
ALTER COLUMN "channel" SET NOT NULL;


-- DropTable
DROP TABLE "Channel";
