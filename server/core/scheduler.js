import config from '../config/index.js';
import transferService from '../services/transferService.js';
import socketManager from '../websocket/socketManager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Scheduler');

class Scheduler {
  constructor(balanceService) {
    this.balanceService = balanceService;
    this.lastPayload = null;
    this.lastSnapshotTimestamp = 0;
    this.nextBalancesAtMs = 0;
    this.balancesInterval = null;
    this.transfersInterval = null;
  }

  async tickBalances() {
    const startTime = Date.now();

    try {
      const result = await this.balanceService.processBalances();

      this.nextBalancesAtMs = startTime + config.intervals.balances;

      this.lastPayload = {
        entity: config.entity.name,
        ts: result.timestamp,
        timestamp: result.timestamp,
        rows: result.rows,
        top100: result.rows, 
        totalAssets: result.totalAssets,
        countdownSec: Math.max(
          0,
          Math.floor((this.nextBalancesAtMs - Date.now()) / 1000)
        ),
        intervalMs: config.intervals.balances,
      };

      socketManager.broadcastUpdate(this.lastPayload);

      this.lastSnapshotTimestamp = startTime;

      logger.info('Balance tick completed', {
        timestamp: result.timestamp,
        rows: result.rows.length,
        nextTickSec: Math.floor((this.nextBalancesAtMs - Date.now()) / 1000),
      });
    } catch (error) {
      logger.error('Balance tick failed', { error: error.message });
    }
  }

  async tickTransfers() {
    try {
      const sinceMs = this.lastSnapshotTimestamp || Date.now() - 20 * 60 * 1000;

      const topTransfers = await transferService.computeTopTransfersSince(sinceMs);

      if (this.lastPayload) {
        this.lastPayload.transferTop100 = topTransfers;

        this.lastPayload.countdownSec = Math.max(
          0,
          Math.floor((this.nextBalancesAtMs - Date.now()) / 1000)
        );
        this.lastPayload.intervalMs = config.intervals.balances;

        socketManager.broadcastUpdate(this.lastPayload);
      }

      logger.info('Transfer tick completed', {
        topTransfers: topTransfers.length,
        since: new Date(sinceMs).toISOString(),
      });
    } catch (error) {
      logger.error('Transfer tick failed', { error: error.message });
    }
  }

  async start() {
    logger.info('Starting scheduler', {
      balancesIntervalMs: config.intervals.balances,
      transfersIntervalMs: config.intervals.transfers,
    });

    await this.tickBalances();
    await this.tickTransfers();

    this.balancesInterval = setInterval(
      () => this.tickBalances(),
      config.intervals.balances
    );

    this.transfersInterval = setInterval(
      () => this.tickTransfers(),
      config.intervals.transfers
    );

    logger.info('Scheduler started successfully');
  }

  stop() {
    if (this.balancesInterval) {
      clearInterval(this.balancesInterval);
      this.balancesInterval = null;
    }

    if (this.transfersInterval) {
      clearInterval(this.transfersInterval);
      this.transfersInterval = null;
    }

    logger.info('Scheduler stopped');
  }

  getLastPayload() {
    return this.lastPayload;
  }

  getNextBalancesTimestamp() {
    return this.nextBalancesAtMs;
  }
}

export default Scheduler;


