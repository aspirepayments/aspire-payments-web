-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "taxRateId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "axable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
