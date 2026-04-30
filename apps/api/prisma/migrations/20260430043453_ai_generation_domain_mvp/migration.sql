-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('queued', 'running', 'post_processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "AiGeneratedStatus" AS ENUM ('ready', 'failed');

-- CreateEnum
CREATE TYPE "GenerationQuality" AS ENUM ('low', 'standard');

-- CreateEnum
CREATE TYPE "FootprintShape" AS ENUM ('rect', 'polygon');

-- CreateEnum
CREATE TYPE "ObjectDefinitionSource" AS ENUM ('manual', 'ai');

-- AlterTable
ALTER TABLE "ObjectDefinition" ADD COLUMN     "source" "ObjectDefinitionSource" NOT NULL DEFAULT 'manual',
ADD COLUMN     "sourceGenerationAssetId" TEXT;

-- CreateTable
CREATE TABLE "AiGenerationJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sceneId" TEXT,
    "provider" TEXT NOT NULL,
    "status" "AiGenerationStatus" NOT NULL DEFAULT 'queued',
    "prompt" TEXT,
    "sourceImageAssetId" TEXT NOT NULL,
    "quality" "GenerationQuality" NOT NULL DEFAULT 'standard',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGeneratedAsset" (
    "id" TEXT NOT NULL,
    "generationJobId" TEXT NOT NULL,
    "glbAssetId" TEXT NOT NULL,
    "objAssetId" TEXT,
    "previewImageAssetId" TEXT,
    "boundsJson" JSONB NOT NULL,
    "pivotMode" TEXT NOT NULL DEFAULT 'bottom-center',
    "normalizedUnit" TEXT NOT NULL DEFAULT 'meter',
    "status" "AiGeneratedStatus" NOT NULL DEFAULT 'ready',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGeneratedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectFootprint2d" (
    "id" TEXT NOT NULL,
    "generatedAssetId" TEXT NOT NULL,
    "shapeType" "FootprintShape" NOT NULL,
    "pointsJson" JSONB NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "depth" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectFootprint2d_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGenerationJob_userId_createdAt_idx" ON "AiGenerationJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiGenerationJob_projectId_createdAt_idx" ON "AiGenerationJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AiGenerationJob_sceneId_idx" ON "AiGenerationJob"("sceneId");

-- CreateIndex
CREATE INDEX "AiGenerationJob_status_createdAt_idx" ON "AiGenerationJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiGeneratedAsset_generationJobId_key" ON "AiGeneratedAsset"("generationJobId");

-- CreateIndex
CREATE INDEX "AiGeneratedAsset_status_createdAt_idx" ON "AiGeneratedAsset"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectFootprint2d_generatedAssetId_key" ON "ObjectFootprint2d"("generatedAssetId");

-- CreateIndex
CREATE INDEX "ObjectDefinition_source_idx" ON "ObjectDefinition"("source");

-- AddForeignKey
ALTER TABLE "AiGenerationJob" ADD CONSTRAINT "AiGenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGenerationJob" ADD CONSTRAINT "AiGenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGenerationJob" ADD CONSTRAINT "AiGenerationJob_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGeneratedAsset" ADD CONSTRAINT "AiGeneratedAsset_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "AiGenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectFootprint2d" ADD CONSTRAINT "ObjectFootprint2d_generatedAssetId_fkey" FOREIGN KEY ("generatedAssetId") REFERENCES "AiGeneratedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
