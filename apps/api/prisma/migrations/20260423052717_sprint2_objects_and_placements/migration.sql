-- CreateTable
CREATE TABLE "ObjectDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "modelAssetId" TEXT,
    "thumbnailAssetId" TEXT,
    "defaultSize" JSONB,
    "pivot" TEXT,
    "allowedRotations" INTEGER[],
    "sockets" JSONB,
    "placementRules" JSONB,
    "scalable" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlacedObject" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "objectDefinitionId" TEXT NOT NULL,
    "name" TEXT,
    "position" JSONB NOT NULL,
    "rotationY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scale" JSONB NOT NULL,
    "params" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlacedObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ObjectDefinition_code_key" ON "ObjectDefinition"("code");

-- CreateIndex
CREATE INDEX "ObjectDefinition_category_idx" ON "ObjectDefinition"("category");

-- CreateIndex
CREATE INDEX "PlacedObject_sceneId_idx" ON "PlacedObject"("sceneId");

-- CreateIndex
CREATE INDEX "PlacedObject_objectDefinitionId_idx" ON "PlacedObject"("objectDefinitionId");

-- AddForeignKey
ALTER TABLE "PlacedObject" ADD CONSTRAINT "PlacedObject_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacedObject" ADD CONSTRAINT "PlacedObject_objectDefinitionId_fkey" FOREIGN KEY ("objectDefinitionId") REFERENCES "ObjectDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
