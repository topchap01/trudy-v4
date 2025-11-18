/*
  Warnings:

  - You are about to alter the column `prizeTierGuidance` on the `MarketCategoryBenchmark` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("json")` to `Json`.

*/
-- CreateTable
CREATE TABLE "BrandKnowledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "market" TEXT NOT NULL DEFAULT 'GLOBAL',
    "slug" TEXT NOT NULL,
    "dossier" JSONB NOT NULL,
    "sourceModel" TEXT,
    "prompt" TEXT,
    "rawResponse" JSONB,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MarketCategoryBenchmark" (
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
    "winnersPerDayTypical" REAL,
    "winnersPerDayStrong" REAL,
    "frequencyFrame" TEXT,
    "topPrizeSweetSpot" INTEGER,
    "prizeTierGuidance" JSONB,
    "progressCueScore" REAL,
    "source" TEXT,
    "confidence" REAL DEFAULT 0.7,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MarketCategoryBenchmark" ("breadthStrong", "breadthTypical", "cadenceHint", "cashbackHighPct", "cashbackMaxPct", "cashbackTypicalPct", "categoryCode", "confidence", "createdAt", "frequencyFrame", "frictionHint", "heroCountStrong", "heroCountTypical", "id", "marketCode", "metadata", "prizeTierGuidance", "progressCueScore", "promoType", "source", "topPrizeSweetSpot", "updatedAt", "winnersPerDayStrong", "winnersPerDayTypical") SELECT "breadthStrong", "breadthTypical", "cadenceHint", "cashbackHighPct", "cashbackMaxPct", "cashbackTypicalPct", "categoryCode", "confidence", "createdAt", "frequencyFrame", "frictionHint", "heroCountStrong", "heroCountTypical", "id", "marketCode", "metadata", "prizeTierGuidance", "progressCueScore", "promoType", "source", "topPrizeSweetSpot", "updatedAt", "winnersPerDayStrong", "winnersPerDayTypical" FROM "MarketCategoryBenchmark";
DROP TABLE "MarketCategoryBenchmark";
ALTER TABLE "new_MarketCategoryBenchmark" RENAME TO "MarketCategoryBenchmark";
CREATE INDEX "MarketCategoryBenchmark_marketCode_categoryCode_promoType_idx" ON "MarketCategoryBenchmark"("marketCode", "categoryCode", "promoType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BrandKnowledge_slug_key" ON "BrandKnowledge"("slug");

-- CreateIndex
CREATE INDEX "BrandKnowledge_brand_idx" ON "BrandKnowledge"("brand");

-- CreateIndex
CREATE INDEX "BrandKnowledge_market_idx" ON "BrandKnowledge"("market");
