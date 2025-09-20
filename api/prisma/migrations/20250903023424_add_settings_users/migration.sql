-- CreateTable
CREATE TABLE "MerchantProfile" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "companyName" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal" TEXT,
    "country" TEXT DEFAULT 'US',
    "phone" TEXT,
    "websiteUrl" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    "logoUrl" TEXT,
    "termsText" TEXT,
    "refundPolicyText" TEXT,
    "privacyPolicyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeConfig" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'none',
    "convenienceFeeCents" INTEGER NOT NULL DEFAULT 0,
    "serviceFeeBps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantProfile_merchantId_key" ON "MerchantProfile"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeConfig_merchantId_key" ON "FeeConfig"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "MerchantProfile" ADD CONSTRAINT "MerchantProfile_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeConfig" ADD CONSTRAINT "FeeConfig_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
