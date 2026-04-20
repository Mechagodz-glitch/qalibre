-- CreateTable
CREATE TABLE "ProjectFeature" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFeature_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "TestGenerationRun"
ADD COLUMN "featureId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFeature_pageId_slug_key" ON "ProjectFeature"("pageId", "slug");

-- CreateIndex
CREATE INDEX "ProjectFeature_pageId_name_idx" ON "ProjectFeature"("pageId", "name");

-- CreateIndex
CREATE INDEX "TestGenerationRun_featureId_createdAt_idx" ON "TestGenerationRun"("featureId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectFeature" ADD CONSTRAINT "ProjectFeature_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ProjectPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestGenerationRun" ADD CONSTRAINT "TestGenerationRun_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "ProjectFeature"("id") ON DELETE SET NULL ON UPDATE CASCADE;
