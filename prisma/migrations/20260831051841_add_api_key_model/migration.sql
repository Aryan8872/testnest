-- CreateEnum
CREATE TYPE "APIKEYSTATUS" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" "APIKEYSTATUS" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_tenant_id_status_idx" ON "ApiKey"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "Payment_tenant_id_customer_id_created_at_idx" ON "Payment"("tenant_id", "customer_id", "created_at");

-- CreateIndex
CREATE INDEX "Payment_tenant_id_invoice_id_created_at_idx" ON "Payment"("tenant_id", "invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "User_tenant_id_created_at_idx" ON "User"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "User_tenant_id_role_created_at_idx" ON "User"("tenant_id", "role", "created_at");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
