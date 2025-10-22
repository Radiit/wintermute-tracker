import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function showStats() {
  try {
    console.log('📊 Database Statistics\n');

    const snapshotCount = await prisma.snapshot.count();
    const holdingCount = await prisma.holding.count();

    const oldestSnapshot = await prisma.snapshot.findFirst({
      orderBy: { ts: 'asc' },
      select: { ts: true, entity: true },
    });

    const newestSnapshot = await prisma.snapshot.findFirst({
      orderBy: { ts: 'desc' },
      select: { ts: true, entity: true },
    });

    const avgHoldings = snapshotCount > 0 ? (holdingCount / snapshotCount).toFixed(2) : 0;

    const entitiesRaw = await prisma.snapshot.groupBy({
      by: ['entity'],
      _count: { entity: true },
    });

    console.log('Records:');
    console.log(`  Snapshots: ${snapshotCount.toLocaleString()}`);
    console.log(`  Holdings:  ${holdingCount.toLocaleString()}`);
    console.log(`  Avg holdings/snapshot: ${avgHoldings}\n`);

    if (oldestSnapshot && newestSnapshot) {
      const durationMs = newestSnapshot.ts.getTime() - oldestSnapshot.ts.getTime();
      const durationDays = (durationMs / (1000 * 60 * 60 * 24)).toFixed(1);

      console.log('Time Range:');
      console.log(`  Oldest: ${oldestSnapshot.ts.toISOString()} (${oldestSnapshot.entity})`);
      console.log(`  Newest: ${newestSnapshot.ts.toISOString()} (${newestSnapshot.entity})`);
      console.log(`  Duration: ${durationDays} days\n`);
    }

    if (entitiesRaw.length > 0) {
      console.log('Entities:');
      entitiesRaw.forEach((e) => {
        console.log(`  ${e.entity}: ${e._count.entity.toLocaleString()} snapshots`);
      });
      console.log();
    }

    const estimatedMB = ((snapshotCount * 0.5) + (holdingCount * 0.1)).toFixed(2);
    console.log(`Estimated Size: ~${estimatedMB} MB`);
    console.log('\n💡 Recommendations:');
    const ageInDays = oldestSnapshot ? 
      ((Date.now() - oldestSnapshot.ts.getTime()) / (1000 * 60 * 60 * 24)).toFixed(0) : 0;
    
    if (ageInDays > 90) {
      console.log(`  ⚠️  You have data older than 90 days (${ageInDays} days)`);
      console.log('  Consider running: node scripts/cleanup-old-snapshots.js 30');
    } else if (ageInDays > 30) {
      console.log(`  ℹ️  You have data older than 30 days (${ageInDays} days)`);
      console.log('  You might want to run: node scripts/cleanup-old-snapshots.js 30');
    } else {
      console.log('  ✅ Data retention looks good');
    }

  } catch (error) {
    console.error('❌ Failed to fetch stats:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

showStats();

