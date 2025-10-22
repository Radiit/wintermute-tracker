import { createLogger } from '../../utils/logger.js';

const logger = createLogger('SnapshotRepository');

class SnapshotRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findLatest(entity) {
    try {
      const snapshot = await this.prisma.snapshot.findFirst({
        where: { entity },
        orderBy: { ts: 'desc' },
        include: { holdings: true },
      });

      if (!snapshot) return null;

      const holdingsMap = {};
      for (const holding of snapshot.holdings) {
        holdingsMap[holding.symbol] = Number(holding.amount || 0);
      }

      return holdingsMap;
    } catch (error) {
      logger.error('Failed to find latest snapshot', { 
        entity, 
        error: error.message 
      });
      return null;
    }
  }

  async findAtOrBefore(entity, targetDate) {
    try {
      const snapshot = await this.prisma.snapshot.findFirst({
        where: { 
          entity, 
          ts: { lte: targetDate } 
        },
        orderBy: { ts: 'desc' },
        include: { holdings: true },
      });

      if (!snapshot) return null;

      const holdingsMap = {};
      for (const holding of snapshot.holdings) {
        holdingsMap[holding.symbol] = Number(holding.amount || 0);
      }

      return holdingsMap;
    } catch (error) {
      logger.error('Failed to find snapshot at or before date', { 
        entity,
        targetDate: targetDate.toISOString(),
        error: error.message 
      });
      return null;
    }
  }

  async create(entity, timestamp, holdingsMap) {
    try {
      const symbols = Object.keys(holdingsMap);
      
      const snapshot = await this.prisma.snapshot.create({
        data: {
          entity,
          ts: new Date(timestamp),
          holdings: symbols.length ? {
            createMany: {
              data: symbols.map((symbol) => ({
                symbol,
                amount: Number(holdingsMap[symbol] || 0),
              })),
              skipDuplicates: false,
            },
          } : undefined,
        },
      });

      logger.debug('Created snapshot', { 
        entity, 
        timestamp, 
        symbols: symbols.length 
      });

      return snapshot;
    } catch (error) {
      logger.error('Failed to create snapshot', { 
        entity, 
        timestamp,
        error: error.message 
      });
      throw error;
    }
  }

  async count(entity) {
    try {
      return await this.prisma.snapshot.count({
        where: { entity },
      });
    } catch (error) {
      logger.error('Failed to count snapshots', { 
        entity,
        error: error.message 
      });
      return 0;
    }
  }

  async deleteOldest(entity, count) {
    try {
      const oldestSnapshots = await this.prisma.snapshot.findMany({
        where: { entity },
        orderBy: { ts: 'asc' },
        take: count,
        select: { id: true },
      });

      if (oldestSnapshots.length === 0) {
        return 0;
      }

      const ids = oldestSnapshots.map(s => s.id);

      await this.prisma.holding.deleteMany({
        where: {
          snapshotId: { in: ids },
        },
      });

      const result = await this.prisma.snapshot.deleteMany({
        where: {
          id: { in: ids },
        },
      });

      logger.info('Deleted oldest snapshots', {
        entity,
        count: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to delete oldest snapshots', {
        entity,
        count,
        error: error.message,
      });
      throw error;
    }
  }

  async deleteOlderThan(entity, date) {
    try {
      const snapshots = await this.prisma.snapshot.findMany({
        where: {
          entity,
          ts: { lt: date },
        },
        select: { id: true },
      });

      if (snapshots.length === 0) {
        return 0;
      }

      const ids = snapshots.map(s => s.id);

      await this.prisma.holding.deleteMany({
        where: {
          snapshotId: { in: ids },
        },
      });

      const result = await this.prisma.snapshot.deleteMany({
        where: {
          id: { in: ids },
        },
      });

      logger.info('Deleted snapshots older than date', {
        entity,
        date: date.toISOString(),
        count: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to delete old snapshots', {
        entity,
        date: date.toISOString(),
        error: error.message,
      });
      throw error;
    }
  }
}

export default SnapshotRepository;
