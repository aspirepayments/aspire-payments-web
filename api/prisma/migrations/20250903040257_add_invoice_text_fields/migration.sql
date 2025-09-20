/*
  Warnings:

  - You are about to drop the column `axable` on the `InvoiceItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "message" TEXT,
ADD COLUMN     "term" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" DROP COLUMN "axable",
ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT false;
