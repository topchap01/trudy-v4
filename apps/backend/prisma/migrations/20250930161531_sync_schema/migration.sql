-- CreateTable
CREATE TABLE "Output" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "phaseRunId" TEXT,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "params" JSONB,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Output_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Output_phaseRunId_fkey" FOREIGN KEY ("phaseRunId") REFERENCES "PhaseRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExportArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "phaseRunId" TEXT,
    "kind" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "bytes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExportArtifact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExportArtifact_phaseRunId_fkey" FOREIGN KEY ("phaseRunId") REFERENCES "PhaseRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HeuristicScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "ideaRouteId" TEXT,
    "name" TEXT NOT NULL DEFAULT 'scorecard',
    "score" REAL NOT NULL,
    "breakdown" JSONB,
    "rationale" TEXT,
    "evidenceJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HeuristicScore_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HeuristicScore_ideaRouteId_fkey" FOREIGN KEY ("ideaRouteId") REFERENCES "IdeaRoute" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "clientName" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "market" TEXT,
    "category" TEXT,
    "score" REAL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "prompt" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Campaign" ("category", "clientId", "clientName", "createdAt", "endDate", "id", "market", "mode", "score", "startDate", "status", "title", "updatedAt") SELECT "category", "clientId", "clientName", "createdAt", "endDate", "id", "market", "mode", "score", "startDate", "status", "title", "updatedAt" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Output_campaignId_idx" ON "Output"("campaignId");

-- CreateIndex
CREATE INDEX "Output_phaseRunId_idx" ON "Output"("phaseRunId");

-- CreateIndex
CREATE INDEX "Output_type_idx" ON "Output"("type");

-- CreateIndex
CREATE INDEX "Output_createdAt_idx" ON "Output"("createdAt");

-- CreateIndex
CREATE INDEX "ExportArtifact_campaignId_idx" ON "ExportArtifact"("campaignId");

-- CreateIndex
CREATE INDEX "ExportArtifact_phaseRunId_idx" ON "ExportArtifact"("phaseRunId");

-- CreateIndex
CREATE INDEX "ExportArtifact_kind_idx" ON "ExportArtifact"("kind");

-- CreateIndex
CREATE INDEX "ExportArtifact_createdAt_idx" ON "ExportArtifact"("createdAt");

-- CreateIndex
CREATE INDEX "HeuristicScore_campaignId_idx" ON "HeuristicScore"("campaignId");

-- CreateIndex
CREATE INDEX "HeuristicScore_ideaRouteId_idx" ON "HeuristicScore"("ideaRouteId");

-- CreateIndex
CREATE INDEX "HeuristicScore_name_idx" ON "HeuristicScore"("name");

-- CreateIndex
CREATE INDEX "HeuristicScore_createdAt_idx" ON "HeuristicScore"("createdAt");
