-- CreateTable
CREATE TABLE "MarketCategoryBenchmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketCode" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "promoType" TEXT NOT NULL,
    "breadthTypical" INTEGER,
    "breadthStrong" INTEGER,
    "cashbackTypicalPct" REAL,
    "cashbackHighPct" REAL,
    "cashbackMaxPct" REAL,
    "heroCountTypical" INTEGER,
    "heroCountStrong" INTEGER,
    "cadenceHint" TEXT,
    "frictionHint" TEXT,
    "source" TEXT,
    "confidence" REAL DEFAULT 0.7,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CampaignMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "promoType" TEXT NOT NULL,
    "briefSnapshot" JSONB NOT NULL,
    "rulesSnapshot" JSONB NOT NULL,
    "offerIqVerdict" JSONB,
    "strategistNotes" JSONB,
    "evaluationMeta" JSONB,
    "synthesisMeta" JSONB,
    "outcomes" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignMemory_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaybookSnippet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promoType" TEXT NOT NULL,
    "useCase" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT,
    "confidence" REAL DEFAULT 0.7,
    "metadata" JSONB,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FounderNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "guidance" TEXT NOT NULL,
    "weight" REAL DEFAULT 1,
    "tags" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "MarketCategoryBenchmark_marketCode_categoryCode_promoType_idx" ON "MarketCategoryBenchmark"("marketCode", "categoryCode", "promoType");

-- CreateIndex
CREATE INDEX "CampaignMemory_campaignId_idx" ON "CampaignMemory"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignMemory_marketCode_categoryCode_promoType_idx" ON "CampaignMemory"("marketCode", "categoryCode", "promoType");

-- CreateIndex
CREATE INDEX "CampaignMemory_createdAt_idx" ON "CampaignMemory"("createdAt");

-- CreateIndex
CREATE INDEX "PlaybookSnippet_promoType_useCase_idx" ON "PlaybookSnippet"("promoType", "useCase");

-- CreateIndex
CREATE INDEX "FounderNote_scopeType_scopeId_idx" ON "FounderNote"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "FounderNote_author_idx" ON "FounderNote"("author");
