-- CreateEnum
CREATE TYPE "IDEMPOTENCYSTATUS" AS ENUM ('PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Idempotencykey" (
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "ownerType" TEXT,
    "ownerId" TEXT,
    "status" "IDEMPOTENCYSTATUS" NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idempotencykey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Idempotencykey_ownerId_ownerType_idx" ON "Idempotencykey"("ownerId", "ownerType");
