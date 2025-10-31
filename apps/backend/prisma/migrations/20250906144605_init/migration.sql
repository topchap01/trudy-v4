-- CreateTable
CREATE TABLE "Campaign" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Brief" (
    "campaignId" TEXT NOT NULL PRIMARY KEY,
    "rawText" TEXT,
    "parsedJson" JSONB,
    "assets" JSONB,
    CONSTRAINT "Brief_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PhaseRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhaseRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phaseRunId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentMessage_phaseRunId_fkey" FOREIGN KEY ("phaseRunId") REFERENCES "PhaseRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdeaRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "mechanic" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "riskLevel" TEXT,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdeaRoute_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PhaseRun_campaignId_idx" ON "PhaseRun"("campaignId");

-- CreateIndex
CREATE INDEX "PhaseRun_phase_idx" ON "PhaseRun"("phase");

-- CreateIndex
CREATE INDEX "PhaseRun_status_idx" ON "PhaseRun"("status");

-- CreateIndex
CREATE INDEX "PhaseRun_createdAt_idx" ON "PhaseRun"("createdAt");

-- CreateIndex
CREATE INDEX "AgentMessage_phaseRunId_idx" ON "AgentMessage"("phaseRunId");

-- CreateIndex
CREATE INDEX "AgentMessage_agent_idx" ON "AgentMessage"("agent");

-- CreateIndex
CREATE INDEX "AgentMessage_role_idx" ON "AgentMessage"("role");

-- CreateIndex
CREATE INDEX "AgentMessage_createdAt_idx" ON "AgentMessage"("createdAt");

-- CreateIndex
CREATE INDEX "IdeaRoute_campaignId_idx" ON "IdeaRoute"("campaignId");
