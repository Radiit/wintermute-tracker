import http from 'http';
import config from './config/index.js';
import db from './database/client.js';
import SnapshotRepository from './database/repositories/snapshotRepository.js';
import BalanceService from './services/balanceService.js';
import RetentionService from './services/retentionService.js';
import Scheduler from './core/scheduler.js';
import socketManager from './websocket/socketManager.js';
import { createApp } from './core/app.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('Main');

let httpServer = null;
let scheduler = null;
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    if (scheduler) {
      scheduler.stop();
      logger.info('Scheduler stopped');
    }

    await socketManager.close();
    logger.info('WebSocket server closed');

    if (httpServer) {
      await new Promise((resolve, reject) => {
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      logger.info('HTTP server closed');
    }

    await db.disconnect();
    logger.info('Database disconnected');

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

async function main() {
  try {
    logger.info('Starting Wintermute Tracker...', {
      nodeEnv: config.server.nodeEnv,
      entity: config.entity.name,
      port: config.server.port,
    });

    config.validate();

    await db.connect();

    const snapshotRepository = new SnapshotRepository(db.getClient());
    const retentionService = new RetentionService(snapshotRepository);
    const balanceService = new BalanceService(snapshotRepository, retentionService);
    await balanceService.initialize();
    
    const retentionStats = await retentionService.getStats(config.entity.name);
    if (retentionStats) {
      logger.info('Retention policy active', retentionStats);
    }

    const app = createApp();

    httpServer = http.createServer(app);

    socketManager.initialize(httpServer);

    scheduler = new Scheduler(balanceService);

    app.locals.getLastPayload = () => scheduler.getLastPayload();
    app.locals.getNextBalancesAtMs = () => scheduler.getNextBalancesTimestamp();
    Object.defineProperty(app.locals, 'lastPayload', {
      get: () => scheduler.getLastPayload(),
    });

    Object.defineProperty(app.locals, 'nextBalancesAtMs', {
      get: () => scheduler.getNextBalancesTimestamp(),
    });

    await new Promise((resolve) => {
      httpServer.listen(config.server.port, resolve);
    });

    logger.info(`Server listening on http://localhost:${config.server.port}`);

    await scheduler.start();

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    logger.info('Application startup completed successfully');
  } catch (error) {
    logger.error('Application startup failed', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

main();
