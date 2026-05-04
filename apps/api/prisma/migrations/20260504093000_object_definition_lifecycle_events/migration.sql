-- CreateTable
CREATE TABLE "ObjectDefinitionLifecycleEvent" (
    "id" TEXT NOT NULL,
    "objectDefinitionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectDefinitionLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ObjectDefinitionLifecycleEvent_objectDefinitionId_createdAt_idx" ON "ObjectDefinitionLifecycleEvent"("objectDefinitionId", "createdAt");

-- CreateIndex
CREATE INDEX "ObjectDefinitionLifecycleEvent_actorUserId_createdAt_idx" ON "ObjectDefinitionLifecycleEvent"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "ObjectDefinitionLifecycleEvent" ADD CONSTRAINT "ObjectDefinitionLifecycleEvent_objectDefinitionId_fkey" FOREIGN KEY ("objectDefinitionId") REFERENCES "ObjectDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
