import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function vacuum() {
  console.log('🧹 Running VACUUM on database...\n');
  
  try {
    console.log('Vacuuming Holding table...');
    await prisma.$executeRawUnsafe('VACUUM FULL "Holding"');
    console.log('✅ Holding table vacuumed\n');
    
    console.log('Vacuuming Snapshot table...');
    await prisma.$executeRawUnsafe('VACUUM FULL "Snapshot"');
    console.log('✅ Snapshot table vacuumed\n');
    
    console.log('✅ Database vacuum completed successfully!');
    console.log('Space should now be reclaimed.\n');
    
  } catch (error) {
    if (error.message.includes('VACUUM cannot run inside a transaction')) {
      console.log('⚠️  Cannot run VACUUM inside transaction.');
      console.log('This is normal for some Neon databases.\n');
      console.log('Try running directly with psql:');
      console.log('  psql $DATABASE_URL -c "VACUUM FULL"');
    } else {
      console.error('❌ Vacuum failed:', error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

vacuum();

