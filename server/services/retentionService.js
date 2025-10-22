import { createLogger } from '../utils/logger.js';
import config from '../config/index.js';

const logger = createLogger('RetentionService');

class RetentionService {
  constructor(snapshotRepository) {
    this.snapshotRepository = snapshotRepository;
    
    this.maxSnapshots = parseInt(process.env.MAX_SNAPSHOTS || '100');
    
    this.minSnapshots = parseInt(process.env.MIN_SNAPSHOTS || '10');
    
    logger.info('Retention policy initialized', {
      maxSnapshots: this.maxSnapshots,
      minSnapshots: this.minSnapshots,
    });
  }

  async enforceRetentionPolicy(entity) {
    try {
      const count = await this.snapshotRepository.count(entity);
      
      if (count <= this.maxSnapshots) {
        logger.debug('Retention policy check: OK', { 
          current: count, 
          max: this.maxSnapshots 
        });
        return { cleaned: false, count };
      }

      const toDelete = count - this.maxSnapshots;
      
      logger.info('Retention policy triggered', {
        current: count,
        max: this.maxSnapshots,
        willDelete: toDelete,
      });

      const deleted = await this.snapshotRepository.deleteOldest(entity, toDelete);
      
      logger.info('Retention cleanup completed', {
        deleted,
        remaining: count - deleted,
      });

      return { 
        cleaned: true, 
        deleted, 
        remaining: count - deleted 
      };
    } catch (error) {
      logger.error('Retention policy enforcement failed', { 
        error: error.message 
      });
      return { cleaned: false, error: error.message };
    }
  }

  async emergencyCleanup(entity) {
    try {
      const count = await this.snapshotRepository.count(entity);
      
      const toDelete = Math.max(0, count - this.minSnapshots);
      
      if (toDelete === 0) {
        logger.warn('Emergency cleanup: no snapshots to delete', { count });
        return { deleted: 0, remaining: count };
      }

      logger.warn('Emergency cleanup triggered', {
        current: count,
        willDelete: toDelete,
        willKeep: this.minSnapshots,
      });

      const deleted = await this.snapshotRepository.deleteOldest(entity, toDelete);
      
      logger.info('Emergency cleanup completed', {
        deleted,
        remaining: count - deleted,
      });

      return { deleted, remaining: count - deleted };
    } catch (error) {
      logger.error('Emergency cleanup failed', { error: error.message });
      throw error;
    }
  }

  async getStats(entity) {
    try {
      const count = await this.snapshotRepository.count(entity);
      const utilization = (count / this.maxSnapshots) * 100;
      
      return {
        current: count,
        max: this.maxSnapshots,
        min: this.minSnapshots,
        utilization: utilization.toFixed(1) + '%',
        needsCleanup: count > this.maxSnapshots,
        nearLimit: count > this.maxSnapshots * 0.8,
      };
    } catch (error) {
      logger.error('Failed to get retention stats', { error: error.message });
      return null;
    }
  }
}

export default RetentionService;

