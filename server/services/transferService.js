import arkhamService from './arkhamService.js';
import normalizerService from './normalizerService.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('TransferService');

class TransferService {
  async computeTopTransfersSince(timestampMs) {
    try {
      if (!arkhamService.hasCompleteHeaders()) {
        logger.warn('Skipping transfer computation: incomplete Arkham headers');
        return [];
      }

      let offset = 0;
      const batch = [];
      const maxOffset = 2000;
      const pageSize = 200;

      while (offset <= maxOffset) {
        const rawData = await arkhamService.fetchTransfers(pageSize, offset);
        const items = normalizerService.normalizeTransfers(rawData);

        if (!items.length) break;

        batch.push(...items);

        const oldest = items[items.length - 1].timestamp || 0;
        if (oldest < timestampMs) break;

        if (items.length < pageSize) break;

        offset += pageSize;
      }

      const aggregateMap = new Map();

      for (const transfer of batch) {
        if (transfer.timestamp <= timestampMs) continue;

        const current = aggregateMap.get(transfer.symbol) || {
          symbol: transfer.symbol,
          usdDelta: 0,
          samples: 0,
        };

        current.usdDelta += transfer.direction * transfer.usd;
        current.samples += 1;

        aggregateMap.set(transfer.symbol, current);
      }

      const topTransfers = [...aggregateMap.values()]
        .sort((a, b) => Math.abs(b.usdDelta) - Math.abs(a.usdDelta))
        .slice(0, 100);

      logger.info('Computed top transfers', {
        since: new Date(timestampMs).toISOString(),
        total: batch.length,
        top: topTransfers.length,
      });

      return topTransfers;
    } catch (error) {
      logger.error('Failed to compute top transfers', { error: error.message });
      throw error;
    }
  }
}

const transferService = new TransferService();

export default transferService;


