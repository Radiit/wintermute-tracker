import arkhamService from './arkhamService.js';
import normalizerService from './normalizerService.js';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('BalanceService');

class BalanceService {
  constructor(snapshotRepository, retentionService = null) {
    this.snapshotRepository = snapshotRepository;
    this.retentionService = retentionService;
    this.previousSnapshot = null;
  }

  async initialize() {
    try {
      const loaded = await this.snapshotRepository.findLatest(config.entity.name);
      if (loaded && Object.keys(loaded).length) {
        this.previousSnapshot = loaded;
        logger.info('Loaded previous snapshot', {
          assets: Object.keys(this.previousSnapshot).length,
        });
      }
    } catch (error) {
      logger.warn('Failed to load previous snapshot', { error: error.message });
    }
  }

  async getBaseline(currentTimeMs) {
    // Try lookback configuration first
    if (config.lookback.force > 0 || config.lookback.baseline > 0) {
      const lookbackMinutes = config.lookback.force || config.lookback.baseline;
      const targetDate = new Date(currentTimeMs - lookbackMinutes * 60_000);
      
      const baseline = await this.snapshotRepository.findAtOrBefore(
        config.entity.name,
        targetDate
      );

      if (baseline) {
        logger.debug('Using lookback baseline', { 
          lookbackMinutes,
          targetDate: targetDate.toISOString() 
        });
        return baseline;
      }
    }

    if (this.previousSnapshot) {
      logger.debug('Using previous snapshot as baseline');
      return this.previousSnapshot;
    }

    const dbSnapshot = await this.snapshotRepository.findLatest(config.entity.name);
    logger.debug('Using database snapshot as baseline');
    return dbSnapshot;
  }

  async processBalances() {
    const timestamp = Date.now();
    const timestampIso = new Date(timestamp).toISOString();

    try {
      if (this.retentionService) {
        const result = await this.retentionService.enforceRetentionPolicy(config.entity.name);
        if (result.cleaned) {
          logger.info('Auto-cleanup performed', {
            deleted: result.deleted,
            remaining: result.remaining,
          });
        }
      }

      const rawData = await arkhamService.fetchBalances();

      const normalized = normalizerService.normalizeBalances(rawData);

      const currentAmounts = Object.fromEntries(
        Object.entries(normalized.current).map(([key, value]) => [
          key,
          Number(value.amount || 0),
        ])
      );

      const baseline = await this.getBaseline(timestamp);

      const rows = normalizerService.computeDiff(currentAmounts, baseline);

      try {
        await this.snapshotRepository.create(
          config.entity.name,
          timestampIso,
          currentAmounts
        );
      } catch (saveError) {
        if (saveError.message.includes('53100') || saveError.message.includes('size limit')) {
          logger.warn('Database full, attempting emergency cleanup');
          
          if (this.retentionService) {
            await this.retentionService.emergencyCleanup(config.entity.name);
            
            await this.snapshotRepository.create(
              config.entity.name,
              timestampIso,
              currentAmounts
            );
            
            logger.info('Snapshot saved after emergency cleanup');
          } else {
            throw saveError;
          }
        } else {
          throw saveError;
        }
      }

      this.previousSnapshot = currentAmounts;

      logger.info('Processed balances', {
        timestamp: timestampIso,
        rows: rows.length,
        hasBaseline: !!baseline,
      });

      return {
        timestamp: timestampIso,
        rows,
        totalAssets: rows.length,
      };
    } catch (error) {
      logger.error('Failed to process balances', { error: error.message });
      throw error;
    }
  }
}

export default BalanceService;


