-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Invoice_tenant_id_created_at_idx" ON "Invoice"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "Invoice_tenant_id_customerId_created_at_idx" ON "Invoice"("tenant_id", "customerId", "created_at");
