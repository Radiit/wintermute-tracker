-- AlterTable
ALTER TABLE "Holding" ADD COLUMN     "usd" DECIMAL(65,30);

-- CreateIndex
CREATE INDEX "Holding_symbol_idx" ON "Holding"("symbol");

-- CreateIndex for snapshot timestamp (as requested)
CREATE INDEX IF NOT EXISTS "idx_snapshot_ts" ON "Snapshot"("ts" DESC);
