/*
  Warnings:

  - Added the required column `definition` to the `Integration` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "definition" JSONB NOT NULL;
