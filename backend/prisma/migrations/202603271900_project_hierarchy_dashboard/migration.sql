-- CreateTable
CREATE TABLE "Contributor" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleTitle" TEXT,
    "department" TEXT,
    "location" TEXT,
    "accentColor" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectModule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPage" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "routeHint" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPage_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "TestGenerationRun"
ADD COLUMN "contributorId" TEXT,
ADD COLUMN "pageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_slug_key" ON "Contributor"("slug");

-- CreateIndex
CREATE INDEX "Contributor_name_idx" ON "Contributor"("name");

-- CreateIndex
CREATE INDEX "Contributor_isActive_name_idx" ON "Contributor"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_name_idx" ON "Project"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectModule_projectId_slug_key" ON "ProjectModule"("projectId", "slug");

-- CreateIndex
CREATE INDEX "ProjectModule_projectId_name_idx" ON "ProjectModule"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPage_moduleId_slug_key" ON "ProjectPage"("moduleId", "slug");

-- CreateIndex
CREATE INDEX "ProjectPage_moduleId_name_idx" ON "ProjectPage"("moduleId", "name");

-- CreateIndex
CREATE INDEX "TestGenerationRun_contributorId_createdAt_idx" ON "TestGenerationRun"("contributorId", "createdAt");

-- CreateIndex
CREATE INDEX "TestGenerationRun_pageId_createdAt_idx" ON "TestGenerationRun"("pageId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectModule" ADD CONSTRAINT "ProjectModule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPage" ADD CONSTRAINT "ProjectPage_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ProjectModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestGenerationRun" ADD CONSTRAINT "TestGenerationRun_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestGenerationRun" ADD CONSTRAINT "TestGenerationRun_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ProjectPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
