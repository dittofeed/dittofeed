/*
  Warnings:

  - You are about to drop the `CurrentUserEventsTable` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CurrentUserEventsTable" DROP CONSTRAINT "CurrentUserEventsTable_workspaceId_fkey";

-- DropTable
DROP TABLE "CurrentUserEventsTable";
