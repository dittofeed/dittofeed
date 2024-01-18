/*
  Warnings:

  - Added the required column `fromAddress` to the `DefaultEmailProvider` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DefaultEmailProvider" ADD COLUMN     "fromAddress" TEXT NOT NULL;
