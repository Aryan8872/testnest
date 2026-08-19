/*
  Warnings:

  - A unique constraint covering the columns `[tenant_id,email]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `password` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "password" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Customer_tenant_id_created_at_idx" ON "Customer"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenant_id_email_key" ON "Customer"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
