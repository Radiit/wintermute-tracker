-- CreateTable
CREATE TABLE "Snapshot" (
    "id" BIGSERIAL NOT NULL,
    "entity" TEXT NOT NULL,
    "ts" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "snapshotId" BIGINT NOT NULL,
    "symbol" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("snapshotId","symbol")
);

-- CreateIndex
CREATE INDEX "Snapshot_entity_ts_idx" ON "Snapshot"("entity", "ts" DESC);

-- CreateIndex
CREATE INDEX "Holding_snapshotId_idx" ON "Holding"("snapshotId");

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
