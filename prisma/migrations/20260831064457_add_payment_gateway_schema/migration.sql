/*
  Warnings:

  - Added the required column `gateway` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `transaction_id` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PAYMENTGATEWAY" AS ENUM ('ESEWA', 'KHALTI', 'BANK_TRANSFER');

-- AlterEnum
ALTER TYPE "INVOICESTATUS" ADD VALUE 'PARTIALLY_PAID';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "fee" INTEGER,
ADD COLUMN     "gateway" "PAYMENTGATEWAY" NOT NULL,
ADD COLUMN     "gateway_ref_id" TEXT,
ADD COLUMN     "raw_payload" JSONB,
ADD COLUMN     "transaction_id" TEXT NOT NULL;
