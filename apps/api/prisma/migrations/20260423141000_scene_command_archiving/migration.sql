-- Add soft-archive column for scene lifecycle management
ALTER TABLE "Scene"
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Command log table for idempotent scene mutations
CREATE TABLE "SceneCommand" (
  "id" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "payload" JSONB,
  "result" JSONB,
  "status" TEXT NOT NULL DEFAULT 'succeeded',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SceneCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SceneCommand_sceneId_commandId_key"
ON "SceneCommand"("sceneId", "commandId");

CREATE INDEX "SceneCommand_sceneId_idx"
ON "SceneCommand"("sceneId");

CREATE INDEX "SceneCommand_userId_idx"
ON "SceneCommand"("userId");

CREATE INDEX "Scene_archivedAt_idx"
ON "Scene"("archivedAt");

ALTER TABLE "SceneCommand"
ADD CONSTRAINT "SceneCommand_sceneId_fkey"
FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;
