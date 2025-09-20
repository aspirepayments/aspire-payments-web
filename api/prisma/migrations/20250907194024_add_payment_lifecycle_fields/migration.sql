-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "lastEventAt" TIMESTAMP(3),
ADD COLUMN     "postedAt" TIMESTAMP(3),
ADD COLUMN     "returnCode" TEXT,
ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "settledAt" TIMESTAMP(3);
