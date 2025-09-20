-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "providerRef" TEXT;

-- CreateTable
CREATE TABLE "StraddleConnection" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StraddleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StraddleConnection_merchantId_idx" ON "StraddleConnection"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "StraddleConnection_merchantId_environment_key" ON "StraddleConnection"("merchantId", "environment");

-- CreateIndex
CREATE INDEX "Payment_merchantId_idx" ON "Payment"("merchantId");

-- AddForeignKey
ALTER TABLE "StraddleConnection" ADD CONSTRAINT "StraddleConnection_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
