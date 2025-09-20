-- CreateTable
CREATE TABLE "CustomerExternal" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerExternal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerExternal_customerId_idx" ON "CustomerExternal"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerExternal_provider_externalId_key" ON "CustomerExternal"("provider", "externalId");
