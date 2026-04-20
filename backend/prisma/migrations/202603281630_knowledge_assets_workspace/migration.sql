-- CreateEnum
CREATE TYPE "KnowledgeAssetKind" AS ENUM ('FILE', 'PASTED_TEXT', 'MANUAL_INPUT');

-- CreateEnum
CREATE TYPE "KnowledgeAssetReviewStatus" AS ENUM ('RAW', 'REVIEWED', 'LINKED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "KnowledgeAsset" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "kind" "KnowledgeAssetKind" NOT NULL,
    "sourceFormat" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "contentText" TEXT,
    "previewDataUrl" TEXT,
    "extractedMetadata" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewStatus" "KnowledgeAssetReviewStatus" NOT NULL DEFAULT 'RAW',
    "projectId" TEXT,
    "moduleId" TEXT,
    "pageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeAssetLink" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "datasetItemId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeAssetLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeAsset_title_idx" ON "KnowledgeAsset"("title");

-- CreateIndex
CREATE INDEX "KnowledgeAsset_kind_createdAt_idx" ON "KnowledgeAsset"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeAsset_reviewStatus_createdAt_idx" ON "KnowledgeAsset"("reviewStatus", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeAsset_projectId_moduleId_pageId_idx" ON "KnowledgeAsset"("projectId", "moduleId", "pageId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeAssetLink_assetId_datasetItemId_key" ON "KnowledgeAssetLink"("assetId", "datasetItemId");

-- CreateIndex
CREATE INDEX "KnowledgeAssetLink_datasetItemId_createdAt_idx" ON "KnowledgeAssetLink"("datasetItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "KnowledgeAsset" ADD CONSTRAINT "KnowledgeAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAsset" ADD CONSTRAINT "KnowledgeAsset_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ProjectModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAsset" ADD CONSTRAINT "KnowledgeAsset_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ProjectPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAssetLink" ADD CONSTRAINT "KnowledgeAssetLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "KnowledgeAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAssetLink" ADD CONSTRAINT "KnowledgeAssetLink_datasetItemId_fkey" FOREIGN KEY ("datasetItemId") REFERENCES "DatasetItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
