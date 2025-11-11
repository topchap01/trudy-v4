-- Add felt winnability benchmark columns (SQLite requires one column per statement)
ALTER TABLE "MarketCategoryBenchmark" ADD COLUMN "winnersPerDayTypical" REAL;
ALTER TABLE "MarketCategoryBenchmark" ADD COLUMN "winnersPerDayStrong" REAL;
ALTER TABLE "MarketCategoryBenchmark" ADD COLUMN "frequencyFrame" TEXT;
ALTER TABLE "MarketCategoryBenchmark" ADD COLUMN "topPrizeSweetSpot" INTEGER;
ALTER TABLE "MarketCategoryBenchmark" ADD COLUMN "prizeTierGuidance" JSON;
ALTER TABLE "MarketCategoryBenchmark" ADD COLUMN "progressCueScore" REAL;
