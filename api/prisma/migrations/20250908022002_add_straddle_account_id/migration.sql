/*
  Warnings:

  - A unique constraint covering the columns `[straddleAccountId]` on the table `Merchant` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "straddleAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_straddleAccountId_key" ON "Merchant"("straddleAccountId");
