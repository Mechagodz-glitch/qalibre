-- CreateEnum
CREATE TYPE "AppUserRole" AS ENUM ('ADMIN', 'USER');

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "azureOid" TEXT,
    "role" "AppUserRole" NOT NULL DEFAULT 'USER',
    "pageAccesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "contributorId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_azureOid_key" ON "AppUser"("azureOid");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_contributorId_key" ON "AppUser"("contributorId");

-- CreateIndex
CREATE INDEX "AppUser_email_idx" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "AppUser_role_isActive_idx" ON "AppUser"("role", "isActive");

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
