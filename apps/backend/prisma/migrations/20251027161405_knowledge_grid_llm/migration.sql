-- CreateTable
CREATE TABLE "LlmInsightLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "marketCode" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "promoType" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "confidence" REAL DEFAULT 0.5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LlmInsightLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LlmInsightLog_campaignId_idx" ON "LlmInsightLog"("campaignId");

-- CreateIndex
CREATE INDEX "LlmInsightLog_marketCode_categoryCode_promoType_intent_idx" ON "LlmInsightLog"("marketCode", "categoryCode", "promoType", "intent");
