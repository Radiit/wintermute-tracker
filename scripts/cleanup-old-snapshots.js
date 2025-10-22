import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_RETENTION_DAYS = 30;

async function cleanup() {
  const retentionDays = parseInt(process.argv[2]) || DEFAULT_RETENTION_DAYS;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  console.log(`Cleaning up snapshots older than ${retentionDays} days (before ${cutoffDate.toISOString()})`);

  try {
    const holdingsDeleted = await prisma.$executeRaw`
      DELETE FROM "Holding" 
      WHERE "snapshotId" IN (
        SELECT id FROM "Snapshot" WHERE ts < ${cutoffDate}
      )
    `;

    const snapshotsDeleted = await prisma.snapshot.deleteMany({
      where: {
        ts: {
          lt: cutoffDate,
        },
      },
    });

    console.log(`✅ Cleanup completed:`);
    console.log(`   - Snapshots deleted: ${snapshotsDeleted.count}`);
    console.log(`   - Holdings deleted: ${holdingsDeleted}`);

    const remainingSnapshots = await prisma.snapshot.count();
    const remainingHoldings = await prisma.holding.count();
    const oldestSnapshot = await prisma.snapshot.findFirst({
      orderBy: { ts: 'asc' },
      select: { ts: true },
    });
    const newestSnapshot = await prisma.snapshot.findFirst({
      orderBy: { ts: 'desc' },
      select: { ts: true },
    });

    console.log(`\n📊 Current database status:`);
    console.log(`   - Total snapshots: ${remainingSnapshots}`);
    console.log(`   - Total holdings: ${remainingHoldings}`);
    console.log(`   - Oldest snapshot: ${oldestSnapshot?.ts.toISOString() || 'N/A'}`);
    console.log(`   - Newest snapshot: ${newestSnapshot?.ts.toISOString() || 'N/A'}`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanup();

